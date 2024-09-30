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
        this.eslData = {};
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
            const timestamp = sequence * 15;  // Beispiel: Berechnung des Zeitstempels
            const sensorId = documentId.split('_').pop();

            if (!this.sdatData[sensorId]) {
                this.sdatData[sensorId] = [];
            }
            this.sdatData[sensorId].push(new MeteringData(timestamp, volume, sensorId));
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
                if (!this.eslData[sensorId]) {
                    this.eslData[sensorId] = 0;
                }
                this.eslData[sensorId] += value;
            }
        }
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

    visualizeData() {
        const ctx = document.getElementById('chartCanvas').getContext('2d');
        const datasets = [];
        for (const sensorId in this.sdatData) {
            const data = this.sdatData[sensorId].map(d => d.value);
            const labels = this.sdatData[sensorId].map(d => d.timestamp);
            datasets.push({
                label: sensorId,
                data: data,
                borderColor: this.getRandomColor(),
                fill: false
            });
        }

        new Chart(ctx, {
            type: 'line',
            data: {
                labels: datasets.length ? datasets[0].data.map((_, index) => index) : [],
                datasets: datasets
            },
            options: {
                scales: {
                    x: {
                        title: {
                            display: true,
                            text: 'Zeitstempel'
                        }
                    },
                    y: {
                        title: {
                            display: true,
                            text: 'Verbrauch'
                        }
                    }
                }
            }
        });
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

// Globale Instanz des DataProcessor erstellen
const processor = new DataProcessor();

document.getElementById('processData').addEventListener('click', async () => {
    const sdatFolderInput = document.getElementById('sdatFolder');
    const eslFolderInput = document.getElementById('eslFolder');

    // Verarbeite SDAT Dateien
    const sdatFiles = sdatFolderInput.files;
    for (const file of sdatFiles) {
        if (file.name.endsWith('.xml')) {
            await processor.readSdat(file);
        }
    }

    // Verarbeite ESL Dateien
    const eslFiles = eslFolderInput.files;
    for (const file of eslFiles) {
        if (file.name.endsWith('.xml')) {
            await processor.readEsl(file);
        }
    }

    processor.visualizeData();
});

document.getElementById('exportCSV').addEventListener('click', () => {
    processor.exportToCSV();
});

document.getElementById('exportJSON').addEventListener('click', () => {
    processor.exportToJSON();
});
