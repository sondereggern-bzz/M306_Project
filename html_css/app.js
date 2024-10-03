document.getElementById('processData').addEventListener('click', function () {
    const sdatFolder = document.getElementById('sdatFolder').files;
    const eslFolder = document.getElementById('eslFolder').files;
    let time = document.getElementById('timeRange').value;
    let sortedEslResults = {};
    let sortedEinspeisungResults = {};
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
    const eslResults = {}; // To store ESL results by end date
    const effectiveMeterReadings742 = {}; // To store effective meter readings
    const effectiveMeterReadings735 = {}
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
                    let startTime = new Date(startDateTime).getTime() / 1000; // Convert to UNIX timestamp in seconds
                    startTime = adjustTimestamp(startTime); // Adjust timestamp if necessary
                    const totalSequences = xmlDoc.getElementsByTagName('rsm:Sequence').length;

                    const timeSlotsPerDay = 96; // Number of sequences per day
                    const days = Math.floor(totalSequences / timeSlotsPerDay); // Calculate number of complete days

                    for (let x = 0; x < days; x++) {
                        let fileVolume = 0;

                        // Sum up the 96 sequences for each day
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

                        // Determine which dictionary to store the result in based on Document ID
                        if (documentID && documentID.includes('ID742')) {
                            if (!(startTime in sdatResults742)) {
                                sdatResults742[startTime] = fileVolume;
                            }
                            // Do nothing if startTime is already present
                        } else if (documentID && documentID.includes('ID735')) {
                            if (!(startTime in sdatResults735)) {
                                sdatResults735[startTime] = fileVolume;
                            }
                            // Do nothing if startTime is already present
                        }

                        // Increment to the next day
                        startTime += 86400; // 86400 seconds = 1 day
                    }
                }

                sdatFilesProcessed++;

                // Log the results once all SDAT files are processed
                if (sdatFilesProcessed === sdatFolder.length) {
                    console.log('SDAT Results ID742:', sdatResults742);;
                    //console.log('SDAT Results ID735:', sdatResults735);
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

                // Iterate over each TimePeriod
                Array.from(timePeriods).forEach(timePeriod => {
                    const endDate = timePeriod.getAttribute('end');
                    if (endDate) {
                        let roundedTime = new Date(endDate).getTime() / 1000; // Convert to UTC timestamp (seconds)
                        roundedTime = adjustTimestamp(roundedTime);

                        let value1 = 0, value2 = 0; // Initialize values for Bezug
                        let value3 = 0, value4 = 0; // Initialize values for Einspeisung

                        const valueRows = Array.from(timePeriod.getElementsByTagName('ValueRow'));

                        // Accumulate all matching OBIS code values
                        valueRows.forEach(row => {
                            const obisCode = row.getAttribute('obis');
                            const value = parseFloat(row.getAttribute('value'));

                            if (!isNaN(value)) {
                                // Accumulate Bezug values
                                if (obisCode === '1-1:1.8.1') {
                                    value1 += value;
                                }
                                if (obisCode === '1-1:1.8.2') {
                                    value2 += value;
                                }

                                // Accumulate Einspeisung values
                                if (obisCode === '1-1:2.8.1') {
                                    value3 += value;
                                }
                                if (obisCode === '1-1:2.8.2') {
                                    value4 += value;
                                }
                            }
                        });

                        // Add to eslResults if not already present
                        if (!(roundedTime in eslResults) && (value1 + value2 > 0)) {
                            eslResults[roundedTime] = value1 + value2; // Sum of Bezug values
                        }

                        // Add to eslEinspeisung if not already present
                        if (!(roundedTime in eslEinspeisung) && (value3 + value4 > 0)) {
                            eslEinspeisung[roundedTime] = value3 + value4; // Sum of Einspeisung values
                        }
                    }
                });

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
                    //console.log('735: ', sortedEinspeisungResults);

                    const meter742 = calculateEffectiveMeterReadings(sortedEslResults, sdatResults742, effectiveMeterReadings742);
                    const meter735 = calculateEffectiveMeterReadings(eslEinspeisung, sdatResults735, effectiveMeterReadings735);


                    // Compute effective meter readings
                    function calculateEffectiveMeterReadings(esl, sdat, dict) {
                        Object.keys(esl).forEach(dateStr => {
                            const date = parseInt(dateStr); // Convert date string to an integer
                            const eslValue = esl[date];
                            let cumulativeConsumption = 0;
                            let timestamp = date - 86400; // Go back one day (86400 seconds)

                            // Set the initial value in effectiveMeterReadings to the current eslValue
                            dict[date] = eslValue;
                            // Continue to iterate backward in time
                            while (true) {
                                const dailyVolume = sdat[timestamp];

                                // Add daily volume to cumulative consumption if it exists
                                if (dailyVolume) {
                                    cumulativeConsumption += dailyVolume;
                                }

                                // If the current timestamp doesn't exist in effectiveMeterReadings, update it
                                if (!dict.hasOwnProperty(timestamp)) {
                                    dict[timestamp] = eslValue - cumulativeConsumption;
                                }

                                // Stop if timestamp doesn't exist in sdatResults742 or if timestamp already exists in sortedEslResults
                                if (!sdat.hasOwnProperty(timestamp) || esl.hasOwnProperty(timestamp)) {
                                    break;
                                }

                                // Move back one day (86400 seconds)
                                timestamp -= 86400;
                            }
                        });
                        return dict;
                    }




                    console.log('Effective Meter Readings 742:', meter742);
                    console.log('Effective Meter Readings 735:', meter735);
                }
            };

            reader.readAsText(file);
        } else {
            eslFilesProcessed++;
        }
    }



    // Export CSV functionality
    document.getElementById('exportCSV').addEventListener('click', function () {
        exportToCSV(effectiveMeterReadings742, sdatResults735);
    });

    time = document.getElementById('timeRange').value;
    // Add event listener for the createDiagram button
    document.getElementById('createDiagram').addEventListener('click', function () {
        createDiagram(effectiveMeterReadings742, 'ZEIT');
    });

    function formatDate(timestamp) {
        let date = new Date(timestamp * 1000); // Convert seconds to milliseconds
        const day = String(date.getUTCDate()).padStart(2, '0'); // Pad single digits with a leading zero
        const month = String(date.getUTCMonth() + 1).padStart(2, '0'); // Months are 0-indexed, so add 1
        const year = date.getUTCFullYear(); // Get full year
        return `${day}-${month}-${year}`;
    }

    function createDiagram(dates, time) {
        let labels = Object.keys(dates); // Get keys (timestamps) from dates

        // Format each label using the formatDate function
        labels = labels.map(timestamp => formatDate(timestamp)); // Apply formatDate to each label

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

        // Create a new chart
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