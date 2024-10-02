document.getElementById('processData').addEventListener('click', function () {
    const sdatFolder = document.getElementById('sdatFolder').files;
    const eslFolder = document.getElementById('eslFolder').files;
    let time = document.getElementById('timeRange').value;
    let sortedEslResults = NaN
    const sortedVolumeByStartTime = {};
    time = parseInt(time)

    // Check if no files are selected
    if (sdatFolder.length === 0) {
        console.log('No SDAT files selected.');
        return;
    }

    if (eslFolder.length === 0) {
        console.log('No ESL files selected.');
        return;
    }

    let sdatFilesProcessed = 0; // Counter for processed SDAT files
    let eslFilesProcessed = 0; // Counter for processed ESL files
    const volumeByStartTime = {}; // To store volume data by date
    const eslResults = {}; // To store ESL results by end date
    const effectiveMeterReadings = {}; // To store effective meter readings

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

                if (documentID && documentID.includes('ID742')) {
                    if (startDateTime) {
                        let startTime = new Date(startDateTime).getTime() / 1000;

                        const totalSequences = xmlDoc.getElementsByTagName('rsm:Sequence').length;

                        //let time = document.getElementById('timeRange').value;
                        //time = parseInt(time)
                        time = 96
                        const days = Math.floor(totalSequences / time);
                        for (let x = 0; x < days; x++) {
                            let fileVolume = 0;
                            for (let y = 0; y < time; y++) {
                                const index = x * time + y;
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

                            // Increment date and accumulate daily volume
                            startTime += 86400


                            // Accumulate volumes for the same date
                            if (!(startTime in volumeByStartTime)) {
                                volumeByStartTime[startTime] = fileVolume;
                            } else {
                                volumeByStartTime[startTime] += fileVolume;
                            }
                        }
                    }
                }

                sdatFilesProcessed++;

                // Log the results once all SDAT files are processed
                if (sdatFilesProcessed === sdatFolder.length) {
                    const sortedKeys = Object.keys(volumeByStartTime).sort();
                    sortedKeys.forEach(key => {
                        sortedVolumeByStartTime[key] = volumeByStartTime[key];
                    });
                    console.log('Volume Data by Date:', sortedVolumeByStartTime);
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
                const endDates = Array.from(timePeriods).map(timePeriod => {
                    const end = timePeriod.getAttribute('end');
                    if (end) {
                        const date = new Date(end); // Parse the date
                        return Math.floor(date.getTime() / 1000); // Convert to UTC timestamp (seconds)
                    }
                    return null;
                }).filter(date => date !== null);

                const valueRows = Array.from(xmlDoc.getElementsByTagName('ValueRow'));
                let value1 = null, value2 = null; // Set to null to find only the first matching value

                for (const row of valueRows) {
                    const obisCode = row.getAttribute('obis');
                    const value = parseFloat(row.getAttribute('value'));

                    if (value1 === null && obisCode === '1-1:1.8.1' && !isNaN(value)) {
                        value1 = value; // Take only the first matching value for '1-1:1.8.1'
                    }
                    if (value2 === null && obisCode === '1-1:1.8.2' && !isNaN(value)) {
                        value2 = value; // Take only the first matching value for '1-1:1.8.2'
                    }

                    // Stop iterating if both values are found
                    if (value1 !== null && value2 !== null) {
                        break;
                    }
                }

                if (value1 !== null && value2 !== null) {
                    const totalValue = value1 + value2;

                    // Store the sum of the values by end date
                    endDates.forEach(endDate => {
                        if (!(endDate in eslResults)) {
                            eslResults[endDate] = totalValue;
                        }
                    });
                }

                eslFilesProcessed++;

                // Log the results once all ESL files are processed
                if (eslFilesProcessed === eslFolder.length) {
                        sortedEslResults = Object.keys(eslResults).sort().reduce((obj, key) => {
                        obj[key] = eslResults[key];
                        return obj;
                    }, {});
                    console.log('ESL Results by End Date:', sortedEslResults);

                    // Initialize cumulative consumption
                    Object.keys(sortedEslResults).forEach(date => {
                        const eslValue = sortedEslResults[date];

                        // Initialize cumulative consumption for the current ESL date
                        let cumulativeConsumption = 0;

                        // Subtract previous days' SDAT data from the ESL value
                        const parsedDate = new Date(date);
                        parsedDate.setDate(parsedDate.getDate() - 86400); // Go back one day to start subtracting

                        // Iterate backward through the days until we have no more SDAT data
                        while (true) {
                            const dailyVolume = volumeByStartTime[parsedDate] || 0;
                            if (!effectiveMeterReadings.hasOwnProperty(parsedDate)) {
                                cumulativeConsumption += dailyVolume; // Accumulate consumption
                                effectiveMeterReadings[parsedDate] = eslValue - cumulativeConsumption; // Calculate effective reading
                            }
                            // Stop if we've gone past the beginning of the available SDAT data
                            if (!volumeByStartTime.hasOwnProperty(parsedDate)) {
                                break; // Exit if there's no volume data for this date
                            }

                            parsedDate.setDate(parsedDate.getDate() - 86400); // Move to the previous day
                        }
                    });

                    // Now handle SDAT dates that are greater than the last ESL date
                    const lastEslDate = new Date(Object.keys(sortedEslResults).pop());
                    let lastEffectiveValue = Object.values(sortedEslResults).pop(); // Get last ESL value

                    Object.keys(volumeByStartTime).forEach(sdatDate => {
                        const sdatDateObj = new Date(sdatDate);
                        if (sdatDateObj >= lastEslDate) {
                            lastEffectiveValue += volumeByStartTime[sdatDate]; // Accumulate to last effective value
                            effectiveMeterReadings[sdatDate] = lastEffectiveValue; // Store new effective reading for SDAT date
                        }
                    });

                    console.log('Effective Meter Readings:', effectiveMeterReadings);
                }
            };

            reader.readAsText(file);
        } else {
            eslFilesProcessed++;
        }
    }








    // Export CSV functionality
    document.getElementById('exportCSV').addEventListener('click', function () {
        exportToCSV(effectiveMeterReadings);
    });

    time = document.getElementById('timeRange').value;
    // Add event listener for the createDiagram button
    document.getElementById('createDiagram').addEventListener('click', function () {
        createDiagram(sortedEslResults, time);
    });

    function createDiagram(datas, time) {
        const labels = Object.keys(datas);
        const data = {
            labels: labels,
            datasets: [{
                label: `Zählerstand nach ${time}`, // Use the selected time for the label
                data: Object.values(datas),
                fill: false,
                borderColor: 'rgb(75, 192, 192)',
                tension: 0.1
            }]
        };

        const ctx = document.getElementById('meteringChart').getContext('2d');

        // Destroy existing chart if it exists
        if (typeof window.chart !== 'undefined') {
            window.chart.destroy();
        }

        window.chart = new Chart(ctx, {
            type: 'line',
            data: data
        });
    }



    // Function to export data to CSV
    function exportToCSV(data) {
        const rows = [['timestamp','value']];

        Object.keys(data).forEach(timestamp => {
            rows.push([new Date(timestamp).getTime(), data[timestamp]]);
        });

        let csvContent = 'data:text/csv;charset=utf-8,';
        rows.forEach(row => {
            csvContent += row.join(',') + '\n';
        });

        const encodedUri = encodeURI(csvContent);
        const link = document.createElement('a');
        link.setAttribute('href', encodedUri);
        link.setAttribute('download', 'meter_readings.csv');
        document.body.appendChild(link);

        link.click();
    }
});


//npm install chartjs-adapter-date-fns
//npm install chartjs-adapter-moment