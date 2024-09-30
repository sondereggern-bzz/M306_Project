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
        this.chart = null; // Hält die Diagramminstanz
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

    visualizeData(startTime, endTime) {
        const ctx = document.getElementById('meteringChart').getContext('2d');

        // Wenn das Diagramm bereits existiert, löschen wir es
        if (this.chart) {
            this.chart.destroy(); // Zerstöre das bestehende Diagramm
        }

        const datasets = [];
        let allLabels = []; // Alle Labels sammeln
        for (const sensorId in this.sdatData) {
            // Filtern der Daten basierend auf dem Zeitstempel
            const filteredData = this.sdatData[sensorId].filter(data => {
                return (!startTime || data.timestamp >= startTime) && (!endTime || data.timestamp <= endTime);
            });

            const data = filteredData.map(d => d.value);
            const labels = filteredData.map(d => d.timestamp);
            if (labels.length) {
                allLabels = labels; // Setze die Labels auf die gefilterten Labels
            }

            datasets.push({
                label: sensorId,
                data: data,
                borderColor: this.getRandomColor(),
                fill: false
            });
        }

        // Erstelle ein neues Diagramm
        this.chart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: allLabels.length ? allLabels : [], // Verwende die gesammelten Labels
                datasets: datasets
            },
            options: {
                scales: {
                    x: {
                        title: {
                            display: true,
                            text: 'Zeitstempel'
                        },
                        min: 0, // Optional: Setze den Minimalwert
                        max: Math.max(...allLabels) // Optional: Setze den Maximalwert
                    },
                    y: {
                        title: {
                            display: true,
                            text: 'Verbrauch'
                        },
                        min: 0, // Zählerstände können nur steigen
                    }
                },
                responsive: false,
                maintainAspectRatio: false, // Ermöglicht das responsive Verhalten
                plugins: {
                    zoom: {
                        pan: {
                            enabled: true,
                            mode: 'x', // Nur horizontal pannen
                        },
                        zoom: {
                            enabled: true,
                            mode: 'x', // Nur horizontal zoomen
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

document.getElementById('processData').addEventListener('click', async () => {
    const processor = new DataProcessor();
    const sdatFileInput = document.getElementById('sdatFolder');
    const eslFileInput = document.getElementById('eslFolder');
    const startTime = parseInt(document.getElementById('startTime').value);
    const endTime = parseInt(document.getElementById('endTime').value);

    const sdatFiles = sdatFileInput.files;
    const eslFiles = eslFileInput.files;

    // SDAT-Dateien lesen
    for (const file of sdatFiles) {
        await processor.readSdat(file);
    }

    // ESL-Dateien lesen
    for (const file of eslFiles) {
        await processor.readEsl(file);
    }

    // Daten visualisieren
    processor.visualizeData(startTime || undefined, endTime || undefined);
});

document.getElementById('exportCSV').addEventListener('click', () => {
    const processor = new DataProcessor();
    processor.exportToCSV();
});

document.getElementById('exportJSON').addEventListener('click', () => {
    const processor = new DataProcessor();
    processor.exportToJSON();
});
