class MeteringData {
    constructor(timestamp, value, sensorId) {
        this.timestamp = timestamp; // Day since epoch
        this.value = value; // Consumption value
        this.sensorId = sensorId;
        this.meterReading = 0; // Initialize cumulative meter reading
    }
}

class DataProcessor {
    constructor() {
        this.sdatData = {};
        this.eslData = {};
        this.chart = null; // Holds the chart instance
    }

    async readSdat(file) {
        const text = await file.text();
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(text, "application/xml");

        const observations = xmlDoc.getElementsByTagName("rsm:Observation");
        for (let observation of observations) {
            const sequence = parseInt(observation.getElementsByTagName("rsm:Sequence")[0].textContent);
            const volume = parseFloat(observation.getElementsByTagName("rsm:Volume")[0].textContent);
            const documentId = xmlDoc.getElementsByTagName("rsm:DocumentID")[0].textContent;

            // Calculate timestamp in whole days (assuming sequence is in 15 min intervals)
            const timestamp = Math.floor(sequence * 15 / (24 * 60)); // Convert to days since epoch
            const sensorId = documentId.split('_').pop();

            // Ensure the sensor data structure exists
            if (!this.sdatData[sensorId]) {
                this.sdatData[sensorId] = [];
            }

            // Add the consumption data
            const meteringData = new MeteringData(timestamp, volume, sensorId);
            this.sdatData[sensorId].push(meteringData);
        }
    }

    async readEsl(file) {
        const text = await file.text();
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(text, "application/xml");

        const valueRows = xmlDoc.getElementsByTagName("ValueRow");
        for (let valueRow of valueRows) {
            const obisCode = valueRow.getAttribute("obis");
            const value = parseFloat(valueRow.getAttribute("value"));
            const sensorId = this.mapObisToSensor(obisCode);

            if (sensorId) {
                this.eslData[sensorId] = value; // Store absolute reading
            }
        }

        // Now update the meter readings in sdatData based on ESL
        this.calculateMeterReadings();
    }

    mapObisToSensor(obisCode) {
        const mapping = {
            '1-1:1.8.1': 'ID742',
            '1-1:1.8.2': 'ID742',
            '1-1:2.8.1': 'ID735',
            '1-1:2.8.2': 'ID735',
        };
        return mapping[obisCode];
    }

    calculateMeterReadings() {
        for (const sensorId in this.sdatData) {
            // Initialize accumulated reading with the latest ESL reading or 0 if not available
            let accumulatedReading = this.eslData[sensorId] || 0;

            // Calculate cumulative meter readings
            this.sdatData[sensorId].forEach(data => {
                // Accumulate consumption into the accumulated reading
                accumulatedReading += data.value; // Accumulate consumption
                data.meterReading = accumulatedReading; // Update meter reading to reflect total consumption
            });
        }
    }

    visualizeData() {
        const ctx = document.getElementById('meteringChart').getContext('2d');

        // Destroy existing chart if it exists
        if (this.chart) {
            this.chart.destroy();
        }

        const datasets = [];
        const allLabels = new Set(); // Collect all unique day labels
        for (const sensorId in this.sdatData) {
            // Prepare data for the chart
            const timestamps = this.sdatData[sensorId].map(data => data.timestamp);
            const meterReadings = this.sdatData[sensorId].map(data => data.meterReading);

            // Create a unique dataset for this sensor
            datasets.push({
                label: sensorId,
                data: meterReadings,
                borderColor: this.getRandomColor(),
                fill: false
            });

            // Add unique timestamps for the X-axis labels
            timestamps.forEach(timestamp => allLabels.add(`Tag ${timestamp}`));
        }

        // Create a new chart
        this.chart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: Array.from(allLabels), // Use unique labels for days
                datasets: datasets
            },
            options: {
                scales: {
                    x: {
                        title: {
                            display: true,
                            text: 'Tag' // X-axis title in German
                        },
                    },
                    y: {
                        title: {
                            display: true,
                            text: 'Gesamtzählerstand' // Y-axis title in German
                        },
                        min: 0, // Meter readings can only increase
                    }
                },
                responsive: false,
                maintainAspectRatio: false, // Allows responsive behavior
                plugins: {
                    zoom: {
                        wheel: {
                            enabled: true, // Allow zooming with the wheel
                        },
                        drag: {
                            enabled: true, // Allow dragging to pan
                        },
                        pinch: {
                            enabled: true // Allow pinch to zoom
                        }
                    }
                }
            }
        });
    }

    exportToCSV() {
        let csvContent = "data:text/csv;charset=utf-8,timestamp,meter_reading,sensor_id\n";
        for (const sensorId in this.sdatData) {
            this.sdatData[sensorId].forEach(data => {
                csvContent += `${data.timestamp},${data.meterReading},${sensorId}\n`;
            });
        }
        const encodedUri = encodeURI(csvContent);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        link.setAttribute("download", "output.csv");
        document.body.appendChild(link);
        link.click();
    }

    exportToJSON() {
        const jsonData = [];
        for (const sensorId in this.sdatData) {
            const dataPoints = this.sdatData[sensorId].map(data => ({
                ts: data.timestamp,
                meterReading: data.meterReading
            }));
            jsonData.push({
                sensorId: sensorId,
                data: dataPoints
            });
        }
        const jsonString = JSON.stringify(jsonData, null, 2);
        const blob = new Blob([jsonString], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = 'output.json';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }

    getRandomColor() {
        const letters = '0123456789ABCDEF';
        let color = '#';
        for (let i = 0; i < 6; i++) {
            color += letters[Math.floor(Math.random() * 16)];
        }
        return color;
    }
}

const processor = new DataProcessor();

document.getElementById('processData').addEventListener('click', async () => {
    const sdatFileInput = document.getElementById('sdatFolder');
    const eslFileInput = document.getElementById('eslFolder');

    const sdatFiles = sdatFileInput.files;
    const eslFiles = eslFileInput.files;

    // Read SDAT files
    for (const file of sdatFiles) {
        await processor.readSdat(file);
    }

    // Read ESL files
    for (const file of eslFiles) {
        await processor.readEsl(file);
    }

    // Visualize data
    processor.visualizeData();
});

document.getElementById('exportCSV').addEventListener('click', () => {
    processor.exportToCSV();
});

document.getElementById('exportJSON').addEventListener('click', () => {
    processor.exportToJSON();
});
