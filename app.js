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
                let fileVolume = 0; // Reset fileVolume for each file

                // Get the start and end times from <rsm:ReportPeriod>
                const startDateTime = xmlDoc.getElementsByTagName('rsm:StartDateTime')[0]?.textContent;
                const endDateTime = xmlDoc.getElementsByTagName('rsm:EndDateTime')[0]?.textContent;

                // Get the Document ID from <rsm:DocumentID>
                const documentID = xmlDoc.getElementsByTagName('rsm:DocumentID')[0]?.textContent;

                // Check if the Document ID matches ID742
                if (documentID && documentID.includes('ID742')) {
                    // Calculate total duration in minutes if both start and end time are present
                    if (startDateTime && endDateTime) {
                        const startTime = new Date(startDateTime);
                        const endTime = new Date(endDateTime);
                        const totalDurationInMinutes = (endTime - startTime) / (1000 * 60); // Convert milliseconds to minutes
                        const totalSequences = totalDurationInMinutes / 15; // Calculate total sequences (15 min intervals)

                        // Process volumes and calculate total volume for this file
                        for (let j = 0; j < volumes.length; j++) {
                            const volumeValue = parseFloat(volumes[j].textContent);
                            if (!isNaN(volumeValue)) {
                                fileVolume += volumeValue; // Accumulate volume for the current file
                            }
                        }

                        // Process the adjusted timestamps based on sequences
                        for (let k = 0; k < totalSequences; k++) {
                            const currentSequence = k + 1; // Current sequence starts from 1
                            let adjustedStartTime = new Date(startTime);
                            // Check if we need to add a day
                            if (currentSequence % 96 === 0) {
                                adjustedStartTime.setDate(adjustedStartTime.getDate() + (currentSequence / 96));
                            }

                            // Use ISO string format for consistency in the dictionary
                            const adjustedStartTimeString = adjustedStartTime.toISOString();

                            // Check if the adjusted start time already exists in volumeByStartTime
                            if (!(adjustedStartTimeString in volumeByStartTime)) {
                                // Save the volume for this adjusted start time
                                volumeByStartTime[adjustedStartTimeString] = { volume: fileVolume, sequences: totalSequences };
                                console.log(`Total Volume for ${file.name} at ${adjustedStartTimeString}:`, fileVolume, `with ${totalSequences} sequences.`);
                            } else {
                                console.log(`Start time ${adjustedStartTimeString} already exists. Skipping ${file.name}.`);
                            }
                        }
                    } else {
                        console.log(`No <rsm:StartDateTime> or <rsm:EndDateTime> found in ${file.name}.`);
                    }
                } else {
                    console.log(`Document ID does not match ID742 in ${file.name}. Skipping.`);
                }

                // Increment the processed files counter
                filesProcessed++;

                // Log all volumes keyed by adjusted start time after processing the last file
                if (filesProcessed === sdatFolder.length) {
                    // Convert the object to an array and sort it by start time
                    const sortedEntries = Object.entries(volumeByStartTime).sort(([timeA], [timeB]) => new Date(timeA) - new Date(timeB));

                    // Log the sorted dictionary
                    console.log('Volumes by Start Time (Sorted):');
                    sortedEntries.forEach(([time, data]) => {
                        console.log(`Time: ${time}, Volume: ${data.volume}, Sequences: ${data.sequences}`);
                    });
                }
            };

            reader.readAsText(file);
        } else {
            console.log(`File ${file.name} is not an XML file and will be skipped.`);
            filesProcessed++; // Increment even for non-XML files to ensure we check total at the end
        }
    }
});
