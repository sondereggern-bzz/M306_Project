class MeteringData {
    constructor(timestamp, value, sensorId) {
        this.timestamp = timestamp;
        this.value = value;
        this.sensorId = sensorId;
    }
}

class DataProcessor {
    constructor() {
        this.sdatData = {};
        this.meteringChart = null;
    }

    async readSdat(files, count) {
        const filesToRead = count > 0 ? Array.from(files).slice(0, count) : files;

        for (const file of filesToRead) {
            const text = await file.text();
            const parser = new DOMParser();
            const xmlDoc = parser.parseFromString(text, "application/xml");

            const observations = xmlDoc.getElementsByTagName("rsm:Observation");
            for (let observation of observations) {
                const sequence = parseInt(observation.getElementsByTagName("rsm:Sequence")[0].textContent);
                const volume = parseFloat(observation.getElementsByTagName("rsm:Volume")[0].textContent);
                const documentId = xmlDoc.getElementsByTagName("rsm:DocumentID")[0].textContent;
                const timestamp = sequence * 15;  // Beispiel: Berechnung des Zeitstempels
                const sensorId = documentId.split('_').pop();

                if (!this.sdatData[sensorId]) {
                    this.sdatData[sensorId] = [];
                }
                this.sdatData[sensorId].push(new MeteringData(timestamp, volume, sensorId));
            }
        }
    }

    async visualizeData(startTime, endTime) {
        // Vorhandenes Diagramm löschen, um neues zu erstellen
        if (this.meteringChart) {
            this.meteringChart.destroy();
        }

        this.createMeteringChart(startTime, endTime);
    }

    createMeteringChart(startTime, endTime) {
        const ctx = document.getElementById('meteringChart').getContext('2d');
        const datasets = [];

        for (const sensorId in this.sdatData) {
            const filteredData = this.sdatData[sensorId].filter(d => d.timestamp >= startTime && d.timestamp <= endTime);
            const data = filteredData.map(d => d.value);
            const timestamps = filteredData.map(d => d.timestamp);

            datasets.push({
                label: sensorId,
                data: data,
                borderColor: this.getRandomColor(),
                fill: false
            });
        }

        this.meteringChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: this.generateLabels(datasets), // Generiere Labels hier
                datasets: datasets
            },
            options: {
                scales: {
                    x: {
                        title: { display: true, text: 'Zeitstempel' }
                    },
                    y: {
                        title: { display: true, text: 'Zählerstand' },
                        beginAtZero: true
                    }
                },
                plugins: {
                    zoom: {
                        zoom: {
                            wheel: {
                                enabled: true,
                            },
                            pinch: {
                                enabled: true
                            },
                            mode: 'x',
                        },
                        pan: {
                            enabled: true,
                            mode: 'x',
                        }
                    }
                }
            }
        });
    }

    generateLabels(datasets) {
        // Generiere Labels für die X-Achse, falls nötig
        if (datasets.length > 0) {
            const maxLength = Math.max(...datasets.map(ds => ds.data.length));
            return Array.from({ length: maxLength }, (_, index) => index); // Einfache Indizes als Labels
        }
        return [];
    }

    exportToCSV() {
        let csvContent = "data:text/csv;charset=utf-8,timestamp,value,sensor_id\n";
        for (const sensorId in this.sdatData) {
            this.sdatData[sensorId].forEach(data => {
                csvContent += `${data.timestamp},${data.value},${sensorId}\n`;
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
                value: data.value
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

document.getElementById('processData').addEventListener('click', async () => {
    const processor = new DataProcessor();
    const sdatFileInput = document.getElementById('sdatFolder');

    const sdatFiles = sdatFileInput.files;

    const sdatCount = parseInt(document.getElementById('sdatCount').value);
    const startTime = parseInt(document.getElementById('startTime').value) || Number.MIN_SAFE_INTEGER;
    const endTime = parseInt(document.getElementById('endTime').value) || Number.MAX_SAFE_INTEGER;

    await processor.readSdat(sdatFiles, sdatCount);

    processor.visualizeData(startTime, endTime);
});

document.getElementById('exportCSV').addEventListener('click', () => {
    const processor = new DataProcessor();
    processor.exportToCSV();
});

document.getElementById('exportJSON').addEventListener('click', () => {
    const processor = new DataProcessor();
    processor.exportToJSON();
});
