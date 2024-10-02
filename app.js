document.getElementById('processData').addEventListener('click', function () {
    const sdatFolder = document.getElementById('sdatFolder').files;
    const eslFolder = document.getElementById('eslFolder').files;


    // Check if no files are selected
    if (sdatFolder.length === 0) {
        console.log('No SDAT files selected.');
        return;
    }

    /*if (eslFolder.length === 0) {
        console.log('No ESL files selected.');
        return;
    }*/

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

                            // Add daily volume to volumeByStartTime
                            startTime.setDate(startTime.getDate() + 1);
                            const dateTime = startTime.toISOString();
                            const dateOnly = dateTime.split('T')[0];


                            // Accumulate volumes for the same date
                            if (!(dateOnly in volumeByStartTime)) {
                                volumeByStartTime[dateOnly] = fileVolume;
                            } else {
                                volumeByStartTime[dateOnly] += fileVolume;
                            }
                        }
                    }
                } /*else if (documentID && documentID.includes('ID735')) {

                }*/

                sdatFilesProcessed++;

                // Log the results once all SDAT files are processed
                if (sdatFilesProcessed === sdatFolder.length) {
                    const sortedKeys = Object.keys(volumeByStartTime).sort();
                    const sortedVolumeByStartTime = {};
                    sortedKeys.forEach(key => {
                        sortedVolumeByStartTime[key] = volumeByStartTime[key];
                    });
                    console.log('volume not sorted: ', volumeByStartTime)
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
                let value1 = 0, value2 = 0;

                valueRows.forEach(row => {
                    const obisCode = row.getAttribute('obis');
                    const value = parseFloat(row.getAttribute('value'));

                    if (obisCode === '1-1:1.8.1' && !isNaN(value)) {
                        value1 = value;
                    }
                    if (obisCode === '1-1:1.8.2' && !isNaN(value)) {
                        value2 = value;
                    }
                });

                // Store the sum of the values by end date
                endDates.forEach(endDate => {
                    if (endDate) {
                        eslResults[endDate] = (eslResults[endDate] || 0) + value1 + value2;
                    }
                });

                eslFilesProcessed++;

                // Log the results once all ESL files are processed
                if (eslFilesProcessed === eslFolder.length) {
                    const sortedEslResults = Object.keys(eslResults).sort().reduce((obj, key) => {
                        obj[key] = eslResults[key];
                        return obj;
                    }, {});
                    console.log('ESL Results by End Date:', sortedEslResults);

                    // Combine ESL results and volume data to get effective meter readings
                    Object.keys(sortedEslResults).forEach(date => {
                        const eslValue = sortedEslResults[date];
                        const cumulativeConsumption = volumeByStartTime[date] || 0; // Default to 0 if not found
                        effectiveMeterReadings[date] = eslValue + cumulativeConsumption; // Effective reading calculation
                    });

                    console.log('Effective Meter Readings:', effectiveMeterReadings);
                }
            };

            reader.readAsText(file);
        } else {
            eslFilesProcessed++;
        }
    }
});
