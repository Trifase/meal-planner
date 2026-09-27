FROM python:3.12-slim

WORKDIR /app

# Disabilita buffering per log in tempo reale
ENV PYTHONUNBUFFERED=1

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Esposizione porta 9999 per Home Server
EXPOSE 9999

VOLUME ["/app/data"]

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "9999"]
