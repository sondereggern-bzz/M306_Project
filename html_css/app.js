document.getElementById('processData').addEventListener('click', function () {
    const sdatFolder = document.getElementById('sdatFolder').files;
    const eslFolder = document.getElementById('eslFolder').files;
    let sortedEslResults = {};
    let sortedEinspeisungResults = {};


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



                    window.meter742 = calculateEffectiveMeterReadings(eslResults, sdatResults742, effectiveMeterReadings742);
                    window.meter735 = calculateEffectiveMeterReadings(eslEinspeisung, sdatResults735, effectiveMeterReadings735);
                    document.getElementById('notification').innerText = 'Die Daten sind jetzt verarbeitet';
                    console.log('jetzt')
                    document.getElementById('notification').style.display = 'block';



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


                }
            };

            reader.readAsText(file);
        } else {
            eslFilesProcessed++;
        }
    }


    document.getElementById('createDiagram').addEventListener('click', function () {
        let timeRange = document.getElementById('timeRange').value;
        const filteredData742 = filterMeterData(timeRange, meter742)
        const filteredData735 = filterMeterData(timeRange, meter735)


        createDiagram(filteredData742, filteredData735, timeRange, 'meteringChart');

        timeRange = document.getElementById('timeRange').value; // Get the selected time range
        const filteredData742Second = filterMeterData(timeRange, sdatResults742); // Filter the data for ID742
        const filteredData735Second = filterMeterData(timeRange, sdatResults735); // Filter the data for ID735

        createDiagram(filteredData742Second, filteredData735Second, timeRange, 'meteringChart2'); // Call the createDiagram function for the second chart




    });


    function filterMeterData(timeRange, meterData) {
        let filteredData;
        switch (timeRange) {
            case 'Tagen':
                filteredData = meterData; // Return the daily data
                break;
            case 'Wochen':
                filteredData = aggregateWeekly(meterData); // Aggregate data weekly
                break;
            case 'Monaten':
                filteredData = aggregateMonthly(meterData); // Aggregate data monthly
                break;
            default:
                filteredData = meterData; // Default to daily data
        }

        return filteredData;
    }


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

    function createDiagram(data742, data735, time, canvasId) { // Accept canvasId as a parameter
        const labels = Object.keys(data742).map(timestamp => formatDate(timestamp));
        const dataset742 = Object.values(data742);
        const dataset735 = Object.values(data735);

        const chartData = {
            labels: labels,
            datasets: [
                {
                    label: 'ID742',
                    data: dataset742,
                    fill: false,
                    borderColor: 'rgb(75, 192, 192)',
                    tension: 0.1
                },
                {
                    label: 'ID735',
                    data: dataset735,
                    fill: false,
                    borderColor: 'rgb(255, 99, 132)',
                    tension: 0.1
                }
            ]
        };

        const ctx = document.getElementById(canvasId).getContext('2d'); // Get context based on canvasId

        // Destroy existing chart if it exists
        if (typeof window.charts === 'undefined') {
            window.charts = {};
        }
        if (typeof window.charts[canvasId] !== 'undefined') {
            window.charts[canvasId].destroy();
        }

        // Creating the chart with zoom and pan options
        window.charts[canvasId] = new Chart(ctx, {
            type: 'line',
            data: chartData,
            options: {
                responsive: true,
                scales: {
                    x: {
                        title: {
                            display: true,
                            text: 'Datum'
                        }
                    },
                    y: {
                        title: {
                            display: true,
                            text: 'KwH'
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

document.getElementById('exportCSV').addEventListener('click', function () {
    console.log('Export button clicked'); // Log when the button is clicked
    // Ensure only one call per button click for each meter
    exportToCSV('ID742', window.meter742);
    exportToCSV('ID735', window.meter735);
});

function exportToCSV(sensorID, data) {
    // Check if data is not empty
    if (Object.keys(data).length === 0) {
        console.warn(`No data available for ${sensorID} to export.`);
        return; // If there's no data, exit the function
    }

    // Convert the data object to CSV format
    let csvContent = "timestamp;value\n"; // CSV header

    Object.entries(data).forEach(([timestamp, value]) => {
        csvContent += `${timestamp};${value}\n`; // Append each entry
    });

    // Create a Blob from the CSV content
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", `${sensorID}.csv`); // Filename based on sensorID
    document.body.appendChild(link);
    link.click(); // Programmatically click the link to trigger download
    document.body.removeChild(link); // Clean up by removing the link
}



document.getElementById('exportJSON').addEventListener('click', function () {
    console.log('Export button clicked'); // Log when the button is clicked
    exportToJSON(); // Call the export function for JSON
});

function exportToJSON() {
    // Create the JSON structure
    const jsonData = [
        {
            "sensorId": "ID742",
            "data": Object.entries(window.meter742).map(([ts, value]) => ({
                "ts": ts,
                "value": value
            }))
        },
        {
            "sensorId": "ID735",
            "data": Object.entries(window.meter735).map(([ts, value]) => ({
                "ts": ts,
                "value": value
            }))
        }
    ];

    // Convert the JavaScript object to JSON string
    const jsonString = JSON.stringify(jsonData, null, 4); // Pretty print with 4 spaces

    // Create a Blob from the JSON string
    const blob = new Blob([jsonString], { type: 'application/json;charset=utf-8;' });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", '742_735.json'); // Filename for the JSON file
    document.body.appendChild(link);
    link.click(); // Programmatically click the link to trigger download
    document.body.removeChild(link); // Clean up by removing the link
}





