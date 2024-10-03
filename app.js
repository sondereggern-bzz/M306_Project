document.getElementById('processData').addEventListener('click', function () {
    const sdatFolder = document.getElementById('sdatFolder').files;
    const eslFolder = document.getElementById('eslFolder').files;
    let time = document.getElementById('timeRange').value;
    let sortedEslResults = {};
    let sortedEinspeisungResults = {};
    const sortedVolumeByStartTime = {};
    time = parseInt(time);

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
    const eslEinspeisung = {};
    const sdatResults742 = {}; // Dictionary for SDAT ID742
    const sdatResults735 = {}; // Dictionary for SDAT ID735

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
                    let startTime = new Date(startDateTime).getTime() / 1000;
                    startTime = adjustTimestamp(startTime)
                    const totalSequences = xmlDoc.getElementsByTagName('rsm:Sequence').length;

                    time = 96; // Can be adjusted as per requirement
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



                        // Determine which dictionary to store the result in based on Document ID
                        if (documentID && documentID.includes('ID742')) {
                            if (!(startTime in sdatResults742)) {
                                sdatResults742[startTime] = fileVolume;
                            } else {
                                sdatResults742[startTime] += fileVolume;
                            }
                        } else if (documentID && documentID.includes('ID735')) {
                            if (!(startTime in sdatResults735)) {
                                sdatResults735[startTime] = fileVolume;
                            } else {
                                sdatResults735[startTime] += fileVolume;
                            }
                        }
                        startTime += 86400 // Increment date and accumulate daily volume

                    }
                }

                sdatFilesProcessed++;

                // Log the results once all SDAT files are processed
                if (sdatFilesProcessed === sdatFolder.length) {
                    console.log('SDAT Results ID742:', sdatResults742);
                    console.log('SDAT Results ID735:', sdatResults735);
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
                        let roundedTime =  Math.floor(date.getTime() / 1000); // Convert to UTC timestamp (seconds)
                        roundedTime = adjustTimestamp(roundedTime);
                        return roundedTime;
                    }
                    return null;
                }).filter(date => date !== null);

                const valueRows = Array.from(xmlDoc.getElementsByTagName('ValueRow'));

                // Initialize variables to store values
                let value1 = null, value2 = null; // For Bezug
                let value3 = null, value4 = null; // For Einspeisung

                for (const row of valueRows) {
                    const obisCode = row.getAttribute('obis');
                    const value = parseFloat(row.getAttribute('value'));

                    // Check for Bezug values
                    if (value1 === null && obisCode === '1-1:1.8.1' && !isNaN(value)) {
                        value1 = value; // First matching value for '1-1:1.8.1'
                    }
                    if (value2 === null && obisCode === '1-1:1.8.2' && !isNaN(value)) {
                        value2 = value; // First matching value for '1-1:1.8.2'
                    }

                    // Check for Einspeisung values
                    if (value3 === null && obisCode === '1-1:2.8.1' && !isNaN(value)) {
                        value3 = value; // First matching value for '1-1:2.8.1'
                    }
                    if (value4 === null && obisCode === '1-1:2.8.2' && !isNaN(value)) {
                        value4 = value; // First matching value for '1-1:2.8.2'
                    }

                    // Stop iterating if all values are found
                    if (value1 !== null && value2 !== null && value3 !== null && value4 !== null) {
                        break;
                    }
                }

                // Check if all values for Bezug and Einspeisung were found
                if (value1 !== null && value2 !== null) {
                    const totalValue = value1 + value2; // Sum of Bezug values

                    // Store the sum of the values by end date
                    endDates.forEach(endDate => {
                        if (!(endDate in eslResults)) {
                            eslResults[endDate] = totalValue; // Store in eslResults
                        }
                    });
                }

                if (value3 !== null && value4 !== null) {
                    const totalValue2 = value3 + value4; // Sum of Einspeisung values

                    // Store the sum of the values by end date
                    endDates.forEach(endDate => {
                        if (!(endDate in eslEinspeisung)) {
                            eslEinspeisung[endDate] = totalValue2; // Store in eslEinspeisung
                        }
                    });
                }


                eslFilesProcessed++;

                // Log the results once all ESL files are processed
                if (eslFilesProcessed === eslFolder.length) {
                    // Sort and reduce for Bezug (ID742)
                    sortedEslResults = Object.keys(eslResults).sort().reduce((obj, key) => {
                        obj[key] = eslResults[key];
                        return obj;
                    }, {});

                    // Sort and reduce for Einspeisung (ID735)
                    sortedEinspeisungResults = Object.keys(eslEinspeisung).sort().reduce((obj, key) => {
                        obj[key] = eslEinspeisung[key];
                        return obj;
                    }, {});

                    console.log('742: ', sortedEslResults);
                    console.log('735: ', sortedEinspeisungResults);


                    const reversedEslResults = Object.keys(sortedEslResults)
                        .reverse() // Reverse the array of keys
                        .reduce((acc, key) => {
                            acc[key] = sortedEslResults[key]; // Rebuild the object with reversed keys
                            return acc;
                        }, {});

                    console.log(`reversed esl: ${reversedEslResults}`);
                    // Initialize cumulative consumption
                    Object.keys(reversedEslResults).forEach(date => {
                        const eslValue = reversedEslResults[date];


                        // Initialize cumulative consumption for the current ESL date
                        let cumulativeConsumption = 0;

                        // Subtract previous days' SDAT data from the ESL value
                        effectiveMeterReadings[date] = eslValue
                        date -= 86400 // Go back one day to start subtracting

                        // Iterate backward through the days until we have no more SDAT data
                        while (true) {
                            const dailyVolume = sdatResults742[timestamp];
                            if (!effectiveMeterReadings.hasOwnProperty(timestamp)) {
                                cumulativeConsumption += dailyVolume; // Accumulate consumption
                                effectiveMeterReadings[timestamp] = eslValue - cumulativeConsumption; // Calculate effective reading
                            }
                            // Stop if we've gone past the beginning of the available SDAT data
                            if (!sdatFolder.hasOwnProperty(timestamp) || sortedEslResults.hasOwnProperty(timestamp)) {
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
        exportToCSV(sdatResults742, sdatResults735);
    });

    time = document.getElementById('timeRange').value;
    // Add event listener for the createDiagram button
    document.getElementById('createDiagram').addEventListener('click', function () {
        createDiagram(sortedEslResults, );
    });

    function createDiagram(dates, time) {
        const labels = Object.keys(dates);
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

        // Destroy existing chart if it exists
        if (typeof window.chart !== 'undefined') {
            window.chart.destroy();
        }

        window.chart = new Chart(ctx, {
            type: 'line',
            data: data
        });
    }

// Function to adjust the timestamp
    function adjustTimestamp(originalTimestamp) {
        // Convert the timestamp (in seconds) to a Date object
        let date = new Date(originalTimestamp * 1000); // Convert to milliseconds

        // Set hours, minutes, seconds, and milliseconds to zero (00:00:00) in UTC
        date.setUTCHours(0, 0, 0, 0);

        // Add one day
        date.setUTCDate(date.getUTCDate() + 1);

        // Convert back to a timestamp (in seconds)
        return Math.floor(date.getTime() / 1000); // Convert back to seconds
    }





    // Function to export data to CSV
    function exportToCSV(data742, data735) {
        // Prepare rows for ID742
        const rows742 = [['timestamp', 'value']];
        Object.keys(data742).forEach(timestamp => {
            rows742.push([timestamp, data742[timestamp]]);
        });

        // Prepare rows for ID735
        const rows735 = [['timestamp', 'value']];
        Object.keys(data735).forEach(timestamp => {
            rows735.push([timestamp, data735[timestamp]]);
        });

        // Create CSV content for ID742
        let csvContent742 = 'data:text/csv;charset=utf-8,';
        rows742.forEach(row => {
            csvContent742 += row.join(';') + '\n';
        });

        // Create CSV content for ID735
        let csvContent735 = 'data:text/csv;charset=utf-8,';
        rows735.forEach(row => {
            csvContent735 += row.join(';') + '\n';
        });

        // Encode URI for ID742
        const encodedUri742 = encodeURI(csvContent742);
        const link742 = document.createElement('a');
        link742.setAttribute('href', encodedUri742);
        link742.setAttribute('download', 'ID742.csv'); // Change the file name to .csv
        document.body.appendChild(link742);

        // Trigger download for ID742
        link742.click();
        document.body.removeChild(link742); // Remove the link after triggering

        // Encode URI for ID735
        const encodedUri735 = encodeURI(csvContent735);
        const link735 = document.createElement('a');
        link735.setAttribute('href', encodedUri735);
        link735.setAttribute('download', 'ID735.csv'); // Change the file name to .csv
        document.body.appendChild(link735);

        // Trigger download for ID735
        link735.click();
        document.body.removeChild(link735); // Remove the link after triggering
    }

});


//npm install chartjs-adapter-date-fns
//npm install chartjs-adapter-moment