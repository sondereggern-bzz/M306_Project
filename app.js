document.getElementById('processData').addEventListener('click', function () {
    const sdatFolder = document.getElementById('sdatFolder').files;
    const eslFolder = document.getElementById('eslFolder').files;
    let time = document.getElementById('timeRange').value;
    let sortedEslResults = {};
    let sortedEinspeisungResults = {};
    time = parseInt(time);

    if (sdatFolder.length === 0) {
        console.log('No SDAT files selected.');
        return;
    }

    if (eslFolder.length === 0) {
        console.log('No ESL files selected.');
        return;
    }

    let sdatFilesProcessed = 0;
    let eslFilesProcessed = 0;
    const eslResults = {};
    const effectiveMeterReadings742 = {};
    const effectiveMeterReadings735 = {};
    const eslEinspeisung = {};
    const sdatResults742 = {};
    const sdatResults735 = {};

    // Processing SDAT files
    for (let i = 0; i < sdatFolder.length; i++) {
        const file = sdatFolder[i];
        if (file.name.endsWith('.xml')) {
            const reader = new FileReader();

            reader.onload = function (event) {
                const xmlContent = event.target.result;
                const parser = new DOMParser();
                const xmlDoc = parser.parseFromString(xmlContent, 'text/xml');

                const volumes = xmlDoc.getElementsByTagName('rsm:Volume');
                const startDateTime = xmlDoc.getElementsByTagName('rsm:StartDateTime')[0]?.textContent;
                const documentID = xmlDoc.getElementsByTagName('rsm:DocumentID')[0]?.textContent;

                if (startDateTime) {
                    let startTime = new Date(startDateTime).getTime() / 1000; // Convert to UNIX timestamp in seconds
                    startTime = adjustTimestamp(startTime);
                    const totalSequences = xmlDoc.getElementsByTagName('rsm:Sequence').length;

                    const timeSlotsPerDay = 96;
                    const days = Math.floor(totalSequences / timeSlotsPerDay);

                    for (let x = 0; x < days; x++) {
                        let fileVolume = 0;

                        for (let y = 0; y < timeSlotsPerDay; y++) {
                            const index = x * timeSlotsPerDay + y;
                            if (index < volumes.length) {
                                const volumeValue = parseFloat(volumes[index]?.textContent);
                                if (!isNaN(volumeValue)) {
                                    fileVolume += volumeValue;
                                }
                            } else {
                                console.warn(`Index ${index} is out of bounds for volumes array of length ${volumes.length}`);
                                break;
                            }
                        }

                        if (documentID && documentID.includes('ID742')) {
                            if (!(startTime in sdatResults742)) {
                                sdatResults742[startTime] = fileVolume;
                            }
                        } else if (documentID && documentID.includes('ID735')) {
                            if (!(startTime in sdatResults735)) {
                                sdatResults735[startTime] = fileVolume;
                            }
                        }

                        startTime += 3600;
                    }
                }

                sdatFilesProcessed++;

                if (sdatFilesProcessed === sdatFolder.length) {
                    console.log('SDAT Results ID742:', sdatResults742);
                }
            };

            reader.readAsText(file);
        } else {
            sdatFilesProcessed++;
        }
    }

    // Processing ESL files
    for (let i = 0; i < eslFolder.length; i++) {
        const file = eslFolder[i];
        if (file.name.endsWith('.xml')) {
            const reader = new FileReader();

            reader.onload = function (event) {
                const xmlContent = event.target.result;
                const parser = new DOMParser();
                const xmlDoc = parser.parseFromString(xmlContent, "text/xml");

                const timePeriods = xmlDoc.getElementsByTagName('TimePeriod');

                Array.from(timePeriods).forEach(timePeriod => {
                    const endDate = timePeriod.getAttribute('end');
                    if (endDate) {
                        let roundedTime = new Date(endDate).getTime() / 1000;
                        roundedTime = adjustTimestamp(roundedTime);

                        let value1 = 0, value2 = 0, value3 = 0, value4 = 0;
                        const valueRows = Array.from(timePeriod.getElementsByTagName('ValueRow'));

                        valueRows.forEach(row => {
                            const obisCode = row.getAttribute('obis');
                            const value = parseFloat(row.getAttribute('value'));

                            if (!isNaN(value)) {
                                if (obisCode === '1-1:1.8.1') {
                                    value1 += value;
                                }
                                if (obisCode === '1-1:1.8.2') {
                                    value2 += value;
                                }
                                if (obisCode === '1-1:2.8.1') {
                                    value3 += value;
                                }
                                if (obisCode === '1-1:2.8.2') {
                                    value4 += value;
                                }
                            }
                        });

                        if (!(roundedTime in eslResults) && (value1 + value2 > 0)) {
                            eslResults[roundedTime] = value1 + value2;
                        }

                        if (!(roundedTime in eslEinspeisung) && (value3 + value4 > 0)) {
                            eslEinspeisung[roundedTime] = value3 + value4;
                        }
                    }
                });

                eslFilesProcessed++;

                if (eslFilesProcessed === eslFolder.length) {
                    sortedEslResults = Object.keys(eslResults).sort().reduce((obj, key) => {
                        obj[key] = eslResults[key];
                        return obj;
                    }, {});

                    sortedEinspeisungResults = Object.keys(eslEinspeisung).sort().reduce((obj, key) => {
                        obj[key] = eslEinspeisung[key];
                        return obj;
                    }, {});

                    console.log('742: ', sortedEslResults);

                    window.meter742 = calculateEffectiveMeterReadings(eslResults, sdatResults742, effectiveMeterReadings742);

                    function calculateEffectiveMeterReadings(esl, sdat, dict) {
                        const lastDate = Math.max(...Object.keys(esl).map(Number));
                        dict[lastDate] = esl[lastDate];
                        let newDate = lastDate - 86400;
                        let oldDate = lastDate;

                        while (newDate >= Object.keys(sdat)[0]) {
                            if (sdat.hasOwnProperty(newDate)) {
                                const newValue = dict[oldDate] - sdat[newDate];
                                if (!isNaN(newValue) && newValue >= 0) {
                                    dict[newDate] = newValue;
                                    oldDate = newDate;
                                }
                            }
                            newDate -= 86400;
                        }
                        return dict;
                    }

                    console.log('Effective Meter Readings 742:', meter742);
                }
            };

            reader.readAsText(file);
        } else {
            eslFilesProcessed++;
        }
    }

    document.getElementById('createDiagram').addEventListener('click', function () {
        let timeRange = document.getElementById('timeRange').value;
        let filteredData;

        switch (timeRange) {
            case 'Tagen':
                filteredData = meter742;
                break;
            case 'Wochen':
                filteredData = aggregateWeekly(meter742);
                break;
            case 'Monaten':
                filteredData = aggregateMonthly(meter742);
                break;
            default:
                filteredData = meter742;
        }

        createDiagram(filteredData, timeRange);
    });

    function aggregateWeekly(data) {
        const weeklyData = {};
        let currentWeek = null;
        let weekSum = 0;

        Object.keys(data).forEach((timestamp, index) => {
            const date = new Date(timestamp * 1000);
            const week = getWeek(date);

            if (currentWeek === null) {
                currentWeek = week;
            }

            if (week === currentWeek) {
                weekSum = data[timestamp];
            } else {
                weeklyData[timestamp] = weekSum;
                currentWeek = week;
                weekSum = data[timestamp];
            }

            if (index === Object.keys(data).length - 1) {
                weeklyData[timestamp] = weekSum;
            }
        });

        return weeklyData;
    }

    function aggregateMonthly(data) {
        const monthlyData = {};
        let currentMonth = null;
        let monthSum = 0;

        Object.keys(data).forEach((timestamp, index) => {
            const date = new Date(timestamp * 1000);
            const month = date.getUTCFullYear() * 100 + date.getUTCMonth();

            if (currentMonth === null) {
                currentMonth = month;
            }

            if (month === currentMonth) {
                monthSum = data[timestamp];
            } else {
                monthlyData[timestamp] = monthSum;
                currentMonth = month;
                monthSum = data[timestamp];
            }

            if (index === Object.keys(data).length - 1) {
                monthlyData[timestamp] = monthSum;
            }
        });

        return monthlyData;
    }

    function getWeek(date) {
        const oneJan = new Date(date.getUTCFullYear(), 0, 1);
        const numberOfDays = Math.floor((date - oneJan) / (24 * 60 * 60 * 1000));
        return Math.ceil((numberOfDays + oneJan.getUTCDay() + 1) / 7);
    }

    function createDiagram(dates, time) {
        let labels = Object.keys(dates).map(timestamp => formatDate(timestamp));

        const data = {
            labels: labels,
            datasets: [{
                label: `Zählerstand nach ${time}`,
                data: Object.values(dates),
                fill: false,
                borderColor: 'rgb(75, 192, 192)',
                tension: 0.1
            }]
        };

        const ctx = document.getElementById('meteringChart').getContext('2d');

        if (typeof window.chart !== 'undefined') {
            window.chart.destroy();
        }

        // Creating the chart with zoom and pan options
        window.chart = new Chart(ctx, {
            type: 'line',
            data: data,
            options: {
                responsive: true,
                scales: {
                    x: {
                        title: {
                            display: true,
                            text: 'Date'
                        }
                    },
                    y: {
                        title: {
                            display: true,
                            text: 'Meter Reading'
                        }
                    }
                },
                plugins: {
                    zoom: {
                        zoom: {
                            wheel: {
                                enabled: true, // Enable zooming with mouse wheel
                            },
                            pinch: {
                                enabled: true // Enable zooming with pinch on touch devices
                            },
                            mode: 'x', // Zoom both axes
                        },
                        pan: {
                            enabled: true,
                            mode: 'x', // Pan both axes
                        },
                    },
                },
            }
        });
    }


    function formatDate(timestamp) {
        let date = new Date(timestamp * 1000);
        const day = String(date.getUTCDate()).padStart(2, '0');
        const month = String(date.getUTCMonth() + 1).padStart(2, '0');
        const year = date.getUTCFullYear();
        return `${day}-${month}-${year}`;
    }
});

function adjustTimestamp(timestamp) {
    return Math.floor(timestamp / 3600) * 3600; // Adjust timestamp to hour
}
