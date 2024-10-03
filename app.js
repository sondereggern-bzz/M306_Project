document.getElementById('processData').addEventListener('click', function () {
    const sdatFolder = document.getElementById('sdatFolder').files;
    const eslFolder = document.getElementById('eslFolder').files;
    let time = document.getElementById('timeRange').value;
    let sortedEslResults = {}
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
    const eslEinspeisung = {}

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
                let value1 = null, value2 = null, value3 = null, value4 = null; // Set to null to find only the first matching value

                for (const row of valueRows) {
                    const obisCode = row.getAttribute('obis');
                    const value = parseFloat(row.getAttribute('value'));

                    if (value1 === null && obisCode === '1-1:1.8.1' && !isNaN(value)) {
                        value1 = value; // Take only the first matching value for '1-1:1.8.1'
                    }
                    if (value2 === null && obisCode === '1-1:1.8.2' && !isNaN(value)) {
                        value2 = value; // Take only the first matching value for '1-1:1.8.2'
                    }

                    if (value3 === null && obisCode === '1-1:2.8.1' && !isNaN(value)) {
                        value3 = value; // Take only the first matching value for '1-1:1.8.1'
                    }
                    if (value4 === null && obisCode === '1-1:2.8.2' && !isNaN(value)) {
                        value4 = value; // Take only the first matching value for '1-1:1.8.2'
                    }


                    // Stop iterating if both values are found
                    if (value1 !== null && value2 !== null && value3 !== null && value4 !== null) {
                        break;
                    }
                }

                if (value1 !== null && value2 !== null && value3 !== null && value4 !== null) {
                    const totalValue = value1 + value2;
                    const totalValue2 = value3 + value4

                    // Store the sum of the values by end date
                    endDates.forEach(endDate => {
                        if (!(endDate in eslResults)) {
                            eslResults[endDate] = totalValue;
                        }
                        if (!(endDate in eslEinspeisung)) {
                            eslEinspeisung[endDate] = totalValue2;
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


                    const reversedEslResults = Object.keys(sortedEslResults)
                        .reverse() // Reverse the array of keys
                        .reduce((acc, key) => {
                            acc[key] = sortedEslResults[key]; // Rebuild the object with reversed keys
                            return acc;
                        }, {});

                    // Initialize cumulative consumption
                    Object.keys(reversedEslResults).forEach(date => {
                        const eslValue = reversedEslResults[date];


                        // Initialize cumulative consumption for the current ESL date
                        let cumulativeConsumption = 0;

                        // Subtract previous days' SDAT data from the ESL value
                        let timestamp = date
                        timestamp -= 86400 // Go back one day to start subtracting

                        // Iterate backward through the days until we have no more SDAT data
                        while (true) {
                            const dailyVolume = volumeByStartTime[timestamp];
                            console.log(dailyVolume)
                            if (!effectiveMeterReadings.hasOwnProperty(timestamp)) {
                                cumulativeConsumption += dailyVolume; // Accumulate consumption
                                effectiveMeterReadings[timestamp] = eslValue - cumulativeConsumption; // Calculate effective reading
                            }
                            // Stop if we've gone past the beginning of the available SDAT data
                            if (!volumeByStartTime.hasOwnProperty(timestamp) || sortedEslResults.hasOwnProperty(timestamp)) {
                                break; // Exit if there's no volume data for this date
                            }

                            timestamp -= 86400 // Move to the previous day
                        }
                    });

                     //Now handle SDAT dates that are greater than the last ESL date
                    /*const lastEslDate = new Date(Object.keys(sortedEslResults).pop());
                    let lastEffectiveValue = Object.values(sortedEslResults).pop(); // Get last ESL value

                    Object.keys(volumeByStartTime).forEach(sdatDate => {
                        const sdatDateObj = new Date(sdatDate);
                        if (sdatDateObj >= lastEslDate) {
                            lastEffectiveValue += volumeByStartTime[sdatDate]; // Accumulate to last effective value
                            effectiveMeterReadings[sdatDate] = lastEffectiveValue; // Store new effective reading for SDAT date
                        }
                    });*/

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
            rows.push([timestamp, data[timestamp]]);
        });

        let csvContent = 'data:text/csv;charset=utf-8,';
        rows.forEach(row => {
            csvContent += row.join(';') + '\n';
        });

        const encodedUri = encodeURI(csvContent);
        const link = document.createElement('a');
        link.setAttribute('href', encodedUri);
        link.setAttribute('download', 'ID742');
        document.body.appendChild(link);

        link.click();
    }
});


//npm install chartjs-adapter-date-fns
//npm install chartjs-adapter-moment