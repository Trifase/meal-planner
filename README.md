# 🥑 Metabolic Meal Planner

Applicazione web self-hosted, leggera e reattiva, progettata per la pianificazione settimanale dei pasti familiari, la generazione automatica della lista della spesa domenicale divisa per reparti del supermercato, il calcolo dinamico delle porzioni e l'organizzazione del meal prep.

Ideata per girare senza sforzo su home server Linux (Docker) con persistenza pura su file JSON (zero configurazioni complesse di database).

---

## 🚀 Caratteristiche Principali

### 1. 📅 Calendario Pasti Settimanale
* **Vista Settimanale (Default 7 giorni):** Visualizzazione compatta e leggibile, con possibilità di passare alla Settimana 2 o vedere entrambe le settimane contemporaneamente.
* **Allineamento Orizzontale Perfetto:** Le 5 fasce orarie dei pasti sono allineate al pixel su tutti i giorni per una scansione visiva immediata:
  * ☕ **Colazione** (Tonalità ambra/alba)
  * 🥜 **Spuntino Mattina** (Tonalità lavanda delicato)
  * 🍝 **Pranzo** (Tonalità verde mediterraneo)
  * 🍎 **Spuntino Pomeriggio** (Tonalità pesca/arancio)
  * 🍽️ **Cena** (Tonalità blu notte rilassante)
* **Duplicazione Rapida:** Tasto rapido *"📋 Duplica W1 in W2"* per clonare l'intera settimana con un clic.
* **Pulsante Ricetta Veloce (`📖`):** Ogni slot pasto ha un'icona diretta per aprire la scheda ricetta completa con le relative dosi.

### 2. 👥 Moltiplicatore Dinamico delle Porzioni
* Scheda di lettura dedicata per ciascun piatto.
* **Stepper Interattivo `[-] [ X persone ] [+]`:** Permette di cucinare solo per 1 persona, per 2, per 3 o per l'intera famiglia.
* Tutte le grammature degli ingredienti si ricalcolano e si moltiplicano istantaneamente in tempo reale.

### 3. 🛒 Lista della Spesa Intelligente (Spesa della Domenica)
* **Calcolo Settimanale:** Di default calcola la spesa per i 7 giorni successivi (oppure per entrambe le settimane).
* **Raggruppamento e Somma Automatica:** Tutti gli ingredienti identici tra ricette diverse vengono aggregati e sommati in un'unica riga.
* **Suddivisione per Reparto del Supermercato:**
  * 🥬 *Ortofrutta*
  * 🥩 *Macellaio sotto casa*
  * 🧀 *Banco Frigo & Latticini*
  * ❄️ *Surgelati*
  * 🥫 *Dispensa, Scatolame & Secco*
  * 🍕 *Pizzeria / Forno*
* **Link Interattivi:** Ogni ingrediente mostra i badge cliccabili delle ricette in cui è utilizzato (*"Usato in: ..."*).
* **📲 Condivisione WhatsApp in 1 Clic:** Formatta l'intera lista della spesa divisa per reparti con emoji e la copia negli appunti pronta da incollare in chat.

### 4. 🍳 Meal Prep Domenicale & Gestione Freezer
* Rilevamento automatico delle basi da preparare la domenica (ragù, cereali lessati per amido resistente, passati di verdura, uova sode).
* Distinzione chiara tra preparazioni da tenere in frigo per la settimana e vaschette destinate al congelatore.

---

## 🐳 Avvio Rapido con Docker Compose

Il modo più semplice per eseguire l'applicazione è tramite Docker Compose (porta predefinita **9999**):

1. **Clona la repository:**
   ```bash
   git clone https://github.com/Trifase/meal-planner.git
   cd meal-planner
   ```

2. **Avvia il container:**
   ```bash
   docker compose up -d --build
   ```

3. **Apri il browser:**
   ```text
   http://localhost:9999
   # oppure http://<IP-DEL-TUO-SERVER>:9999
   ```

> **💾 Persistenza Dati:** La directory `./data/` è montata come volume all'interno del container. Qualsiasi modifica apportata tramite l'interfaccia web viene salvata direttamente nei file JSON locali (`data/recipes.json` e `data/plan.json`), rendendo backup e migrazioni facilissimi (`cp -r data/ backup/`).

---

## 💻 Esecuzione Locale (Senza Docker)

Requisiti: Python 3.10+

```bash
# Installa le dipendenze
pip install -r requirements.txt

# Avvia l'applicazione
python main.py
```

L'applicazione risponderà all'indirizzo `http://localhost:9999`.

---

## 🛠️ Stack Tecnologico

* **Backend:** [FastAPI](https://fastapi.tiangolo.com/) (Python) con [Uvicorn](https://www.uvicorn.org/).
* **Frontend:** Vanilla HTML5, CSS Grid / Flexbox moderno (senza framework pesanti, caricamento istantaneo).
* **Storage:** JSON File Store con Pydantic validation (portabile, versionabile, zero overhead).
* **Container:** Docker con immagine base `python:3.12-slim`.

---

## 📂 Struttura del Progetto

```text
meal-planner/
├── data/
│   ├── recipes.json       # Database ricette con porzioni e ingredienti
│   └── plan.json          # Stato del calendario dei pasti
├── static/
│   ├── index.html         # Interfaccia grafica SPA
│   ├── style.css          # Design responsive e colori delle sezioni
│   └── app.js             # Logica frontend (moltiplicatore, slot, spesa)
├── Dockerfile             # Definizione container Docker
├── docker-compose.yml     # Configurazione Docker Compose (porta 9999)
├── main.py                # API backend FastAPI
├── requirements.txt       # Dipendenze Python
└── README.md              # Documentazione del progetto
```

---

## 📄 Licenza

Rilasciato sotto licenza [MIT](LICENSE). Libero da usare, modificare e distribuire per uso personale o homelab.
