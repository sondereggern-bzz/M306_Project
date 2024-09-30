document.getElementById('uploadForm').addEventListener('submit', function(event) {
    event.preventDefault();

    const sdatFiles = document.getElementById('sdatFolder').files;
    const eslFiles = document.getElementById('eslFolder').files;

    // Hier verarbeiten wir die hochgeladenen Dateien
    processFiles(sdatFiles, eslFiles);
});

async function processFiles(sdatFiles, eslFiles) {
    // Daten aus den Dateien extrahieren und verarbeiten
    const consumptionData = await readSdatFiles(sdatFiles);
    const meterData = await readEslFiles(eslFiles);

    // Diagramme erstellen
    createCharts(consumptionData, meterData);
}

async function readSdatFiles(files) {
    // Verarbeite SDAT-Dateien und extrahiere die Verbrauchswerte
    const consumptionData = [];

    for (const file of files) {
        const text = await file.text();
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(text, "text/xml");

        const observations = xmlDoc.getElementsByTagName('rsm:Observation');
        for (let observation of observations) {
            const timestamp = new Date(observation.getElementsByTagName('rsm:StartDateTime')[0].textContent).getTime() / 1000;
            const volume = parseFloat(observation.getElementsByTagName('rsm:Volume')[0].textContent);
            consumptionData.push({ ts: timestamp, value: volume });
        }
    }
    return consumptionData;
}

async function readEslFiles(files) {
    // Verarbeite ESL-Dateien und extrahiere die Zählerstände
    const meterData = [];

    for (const file of files) {
        const text = await file.text();
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(text, "text/xml");

        const valueRows = xmlDoc.getElementsByTagName('ValueRow');
        for (let valueRow of valueRows) {
            const obis = valueRow.getAttribute('obis');
            const value = parseFloat(valueRow.getAttribute('value'));

            meterData.push({ obis, value });
        }
    }
    return meterData;
}

function createCharts(consumptionData, meterData) {
    const ctx1 = document.getElementById('consumptionChart').getContext('2d');
    const ctx2 = document.getElementById('meterChart').getContext('2d');

    // Diagramm für Verbrauchswerte
    new Chart(ctx1, {
        type: 'line',
        data: {
            labels: consumptionData.map(data => new Date(data.ts * 1000).toLocaleString()),
            datasets: [{
                label: 'Verbrauchswerte',
                data: consumptionData.map(data => data.value),
                borderColor: 'rgba(75, 192, 192, 1)',
                fill: false
            }]
        },
        options: {
            responsive: true,
            scales: {
                x: {
                    type: 'time',
                    time: {
                        unit: 'hour'
                    }
                }
            }
        }
    });

    // Diagramm für Zählerstände (hier solltest du die Logik entsprechend anpassen)
    const meterLabels = meterData.map(data => data.obis);
    const meterValues = meterData.map(data => data.value);

    new Chart(ctx2, {
        type: 'bar',
        data: {
            labels: meterLabels,
            datasets: [{
                label: 'Zählerstände',
                data: meterValues,
                backgroundColor: 'rgba(153, 102, 255, 0.2)',
                borderColor: 'rgba(153, 102, 255, 1)',
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            scales: {
                y: {
                    beginAtZero: true
                }
            }
        }
    });
}
