export const blinkExample = `// Programa de ejemplo Arduino
// Parpadeo de un LED conectado al pin 13

int led = 13;

void setup() {
  // Configuramos el pin como salida
  pinMode(led, OUTPUT);
}

void loop() {
  // Encendemos el LED
  digitalWrite(led, HIGH);
  delay(1000);

  // Apagamos el LED
  digitalWrite(led, LOW);
  delay(1000);
}`;
