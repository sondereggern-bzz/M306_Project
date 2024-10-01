document.getElementById('processData').addEventListener('click', function () {
    const sdatFolder = document.getElementById('sdatFolder').files;

    // Check if no files are selected
    if (sdatFolder.length === 0) {
        console.log('No files selected.');
        return;
    }

    let filesProcessed = 0; // Counter for processed files

    // Data structure to store volume by start time
    const volumeByStartTime = {};

    for (let i = 0; i < sdatFolder.length; i++) {
        const file = sdatFolder[i];
        if (file.name.endsWith('.xml')) {
            const reader = new FileReader();

            reader.onload = function (event) {
                const xmlContent = event.target.result;
                const parser = new DOMParser();
                const xmlDoc = parser.parseFromString(xmlContent, 'application/xml');

                // Get all <rsm:Volume> elements
                const volumes = xmlDoc.getElementsByTagName('rsm:Volume');

                // Get the start and end times from <rsm:ReportPeriod>
                const startDateTime = xmlDoc.getElementsByTagName('rsm:StartDateTime')[0]?.textContent;
                const endDateTime = xmlDoc.getElementsByTagName('rsm:EndDateTime')[0]?.textContent;

                // Get the Document ID from <rsm:DocumentID>
                const documentID = xmlDoc.getElementsByTagName('rsm:DocumentID')[0]?.textContent;

                // Check if the Document ID matches ID742
                if (documentID && documentID.includes('ID742')) {
                    // Calculate total duration in minutes if both start and end time are present
                    if (startDateTime && endDateTime) {
                        let startTime = new Date(startDateTime);
                        const endTime = new Date(endDateTime);
                        const totalSequences = xmlDoc.getElementsByTagName('rsm:Sequence').length

                        const days = Math.floor(totalSequences / 96);
                        for (let x = 0; x < days; x++) {
                            let fileVolume = 0;
                            for (let y = 0; y < 96; y++) {
                                const index = x * 96 + y;

                                // Check if the index is within bounds
                                if (index < volumes.length) {
                                    const volumeValue = parseFloat(volumes[index]?.textContent);
                                    if (!isNaN(volumeValue)) {
                                        fileVolume += volumeValue; // Accumulate volume for the current file
                                    }
                                } else {
                                    console.warn(`Index ${index} is out of bounds for volumes array of length ${volumes.length}`);
                                    break; // Exit the loop if we go out of bounds
                                }
                            }


                            startTime.setDate(startTime.getDate() + x);
                            const dateTime = startTime.toISOString();
                            if (dateTime in volumeByStartTime) {
                                console.log("Key already exists");
                            } else {
                                volumeByStartTime[dateTime] = fileVolume
                            }

                        }
                    }
                }

                // Increment the processed files counter
                filesProcessed++;


                if (filesProcessed === sdatFolder.length) {
                    // Sort and log volumeByStartTime once all files are processed
                    const sortedKeys = Object.keys(volumeByStartTime).sort();
                    const sortedVolumeByStartTime = {};
                    sortedKeys.forEach(key => {
                        sortedVolumeByStartTime[key] = volumeByStartTime[key];
                    });
                    console.log(sortedVolumeByStartTime);
                }
                // Log all volumes keyed by adjusted start time after processing the last file
            };

            reader.readAsText(file);
        } else {
          //  console.log(`File ${file.name} is not an XML file and will be skipped.`);
            filesProcessed++; // Increment even for non-XML files to ensure we check total at the end
        }
    }
});
