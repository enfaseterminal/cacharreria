# Guerra de barcos

Juego de **Batalla Naval** para un jugador contra el ordenador, escrito en C
hace algunos años para MS-DOS.

## Cómo jugar

El juego enfrenta dos flotas en tableros de 10 × 10. Puedes elegir si colocar
tus barcos manualmente o dejar que se distribuyan aleatoriamente. La flota del
ordenador se genera al azar. Después, por turnos, cada jugador intenta acertar
las posiciones de los barcos del contrario. Gana quien consiga hundir toda la
flota rival.

El ordenador también intenta localizar el resto de un barco cuando ya ha
acertado una de sus posiciones. Durante la partida, sigue las indicaciones que
aparecen en pantalla para elegir opciones e introducir coordenadas.

## Archivos

- `BARCOS.EXE`: ejecutable para MS-DOS.
- `BARCOS.C`: código fuente del control principal de la partida.
- `BARCOS.H`: constantes, inclusiones y declaraciones compartidas.
- `PRESEN.C`: menús y textos de presentación.
- `ALEA.C`: selección aleatoria de coordenadas.
- `COLO_ALE.C`: elección de dirección para la colocación aleatoria de barcos.
- `pchun.C`: seguimiento de los impactos y hundimientos de la flota del
  ordenador.

## Ejecución

`BARCOS.EXE` es un programa de MS-DOS. En un sistema actual puedes probarlo
con un emulador de DOS, como DOSBox: abre la carpeta del juego desde el
emulador y ejecuta:

```text
BARCOS.EXE
```

## Código fuente

La carpeta todavía no contiene todos los módulos que `BARCOS.H` declara y
`BARCOS.C` utiliza. Entre las funciones sin su implementación correspondiente
están las de colocación de barcos, dibujo del tablero, entrada de coordenadas,
mensajes y estrategia del ordenador. Por eso, los fuentes disponibles no
bastan para recompilar el juego: harían falta los módulos restantes y un
compilador compatible con las funciones de DOS usadas por el programa.
