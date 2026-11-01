export const completeArduinoExample = `#include <Arduino.h>

// LED de estado
const int ledPin = 13;
int readings[3] = {0, 0, 0};

int readSensor(int pin) {
  return analogRead(pin);
}

void setup() {
  pinMode(ledPin, OUTPUT);
  Serial.begin(9600);
}

void loop() {
  for (int i = 0; i < 3; i++) {
    readings[i] = readSensor(i); // conservar comentario final
  }

  if (readings[0] > 100 && digitalRead(ledPin) == LOW) {
    digitalWrite(ledPin, HIGH);
    Serial.println("// esto es texto, no un comentario");
  } else if (readings[1] > 50) {
    analogWrite(ledPin, readings[1]);
  } else {
    // Pausa entre lecturas
    delay(250);
  }

  int index = 0;
  while (index < 3) {
    switch (readings[index]) {
      case 0:
        continue;
      case 1:
        break;
      default:
        index++;
    }
    index++;
  }

  do {
    index--;
  } while (index > 0);
}`;
