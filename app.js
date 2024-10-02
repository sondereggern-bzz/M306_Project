document.getElementById('processData').addEventListener('click', function () {
    const sdatFolder = document.getElementById('sdatFolder').files;
    const eslFolder = document.getElementById('eslFolder').files;

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
                        let startTime = new Date(startDateTime);
                        const totalSequences = xmlDoc.getElementsByTagName('rsm:Sequence').length;

                        const days = Math.floor(totalSequences / 96);
                        for (let x = 0; x < days; x++) {
                            let fileVolume = 0;
                            for (let y = 0; y < 96; y++) {
                                const index = x * 96 + y;
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
                            startTime.setDate(startTime.getDate() + 1);
                            const dateOnly = startTime.toISOString().split('T')[0];

                            // Accumulate volumes for the same date
                            if (!(dateOnly in volumeByStartTime)) {
                                volumeByStartTime[dateOnly] = fileVolume;
                            }
                        }
                    }
                }

                sdatFilesProcessed++;

                // Log the results once all SDAT files are processed
                if (sdatFilesProcessed === sdatFolder.length) {
                    const sortedKeys = Object.keys(volumeByStartTime).sort();
                    const sortedVolumeByStartTime = {};
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
                    return end ? end.split('T')[0] : null;
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
                    const sortedEslResults = Object.keys(eslResults).sort().reduce((obj, key) => {
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
                        parsedDate.setDate(parsedDate.getDate() - 1); // Go back one day to start subtracting

                        // Iterate backward through the days until we have no more SDAT data
                        while (true) {
                            const dateString = parsedDate.toISOString().split('T')[0];
                            const dailyVolume = volumeByStartTime[dateString] || 0;

                            cumulativeConsumption += dailyVolume; // Accumulate consumption
                            effectiveMeterReadings[dateString] = eslValue - cumulativeConsumption; // Calculate effective reading

                            // Stop if we've gone past the beginning of the available SDAT data
                            if (!volumeByStartTime.hasOwnProperty(dateString)) {
                                break; // Exit if there's no volume data for this date
                            }

                            parsedDate.setDate(parsedDate.getDate() - 1); // Move to the previous day
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

    document.getElementById('exportCSV').addEventListener('click', function () {
        exportToCSV(effectiveMeterReadings);
    });


    function exportToCSV(data) {
        let csvContent = "timestamp;value\n";

        Object.keys(data).forEach(date => {
            const timestamp = new Date(date).getTime() / 1000;
            const value = data[date];
            csvContent += `${timestamp};${value}\n`
        });

        const blob = new Blob([csvContent], {type: 'text/csv'});
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'effective_meter_readings.csv';
        a.click();
        URL.revokeObjectURL(url);
    }

    /*document.getElementById('exportJSON').addEventListener('click', function () {
        exportToJSON(effectiveMeterReadings, volumeByStartTime);
    });

    function exportToJSON(effectiveMeterReadings, volumeByStartTime) {
        // Create JSON structure for multiple sensors
        const jsonObject = [
            {
                "sensorId": "ID742",
                "data": Object.keys(effectiveMeterReadings).map(date => {
                    const timestamp = Math.floor(new Date(date).getTime() / 1000); // Convert date to UNIX timestamp in seconds
                    const value = effectiveMeterReadings[date];
                    return {
                        "ts": timestamp.toString(), // Convert timestamp to string
                        "value": value
                    };
                })
            },
            {
                "sensorId": "ID735",
                "data": Object.keys(volumeByStartTime).map(date => {
                    const timestamp = Math.floor(new Date(date).getTime() / 1000); // Convert date to UNIX timestamp in seconds
                    const value = volumeByStartTime[date];
                    return {
                        "ts": timestamp.toString(), // Convert timestamp to string
                        "value": value
                    };
                })
            }
        ];

        // Convert JSON object to string
        const jsonString = JSON.stringify(jsonObject, null, 2); // Pretty print with indentation

        // Create a Blob and initiate download
        const blob = new Blob([jsonString], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'effective_meter_readings.json';
        a.click();
        URL.revokeObjectURL(url);
    }*/

});


