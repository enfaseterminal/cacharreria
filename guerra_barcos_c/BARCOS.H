# define COR 10	//Coordenadas del tablero
# define ACOR 4	//Tamaño del acorazado
# define POR 3		//Tamaño del porta aviones
# define DES 2		//Tamaño del destructor
# define SUB 1		//Tamaño del submarino
# define TAM 10	//Determina la cantidad de naves por participante
# define PIE 20	//Nuemero de piezas que componen cada flota
# define AGUA 'Û'   //Simbolo que se asignara si ha encontrado agua
# define HUN 'H'   //Define los caracteres que apareceran si el barco es hundido
# define TOC 'T'    //Caracter si el barco es tocado

# include <stdio.h>
# include <conio.h>
# include <stdlib.h>
# include <dos.h>
# include <ctype.h>
# include <string.h>
# include <time.h>

/*barcos.c
Funcion que es el eje del programa, el que controla la ejecucion del juego*/
int barcos (void);

/*meca.c
Funcion que escribe un texto de forma mecanografiada*/
void meca (char text [], int n);

/*color.c
Esta funcion es la encargada de determinar de que color se imprimira el
simbolo que aparecera en el tablero*/
void color (char ch);

/*presen.c
Funcion que realiza la presentacion del programa*/
void presen (int opc);

/*error.c
Error es una funcion que devuelve un mensaje de error al usuario ya que
este a infringido alguna norma*/
void error (int er);

/*dibu.c
Dibuja el mapa por pantalla*/
void dibu_ini (char mapa [COR][COR]);

/*coorden.c
Recoge las coordenadas del usuario y comprueba si estan dentro de los limites*/
char coordenadas (int *cor_x,int *cor_y);

/*ilegal.c
Comprueba que la casilla introducida no es ilegal*/
int comprobar (char mapa[COR][COR], int cor_x, int cor_y);

/*coloca.c
Determinar en que sentido se colocara el barco*/
int coloca (int x,int y, int que);

/*pintar.c
Plasma los barcos en el tablero. donde==En que direccion, ole==Cuantos cuadros*/
void pintar (char mapa [COR][COR], int direc_x, int direc_y, int donde, int ole,int c);

/*filtro.c
Comprueba que el barco puede ser colocado en esas coordenadas*/
int filtro (char mapa[COR][COR], int cor_x, int cor_y, int donde, int ole);

/*alea.c
Asigna unas coordenadas aleatorias entre 0 y 9*/
void aleatorio (int *x, int *y);

/*colo_ale
Determinar en que sentido se colocara el barco aleatoriamente*/
int coloca_ale (int x,int y, int que);

/*usu.c
Funcion que se encarga de pedir y colocar los barcos del usuario
reflejando esas acciones en el tablero de mapa_usu*/
void usu (char mapa_usu [COR][COR]);

/*pc.c
Coloca de forma aleatoria los barcos del PC*/
void pc (char mapa_pc [COR][COR],int c);

/*pchun.c
Fucion que recoge y memoriza la posicion de los barcos del ordenador*/
int pchun (int control,char mapa [COR][COR],char mapa2 [COR][COR],int x,int y,int ole, char car);

/*usuhun.c
Fucion que recoge y memoriza la posicion de los barcos del usuario*/
void usuhun (int control,char mapa [COR][COR],int x,int y,int ole, char car);

/*pintar2.c
Funcion que imprime por pantalla el tablero del usuario el de estrategia del pc*/
void dibu2 (char mapa[COR][COR],char mapa2[COR][COR],int con_por);

/*pin_agua.c
Funcion que se encargara de pintar agua alrededor del barco hundido*/
void pin_agua (int x, int y, char mapa [COR][COR]);

/*ia.c
Funcion que dota al PC la propiedad de buscar los barcos, que una vez que
un barco a sido alcanzado la maquina sea capaz de buscar el resto del mismo*/
void ia (int *x,int *y, int alarma);

/*mensa.c
Funcion encargada de mostrar al usuario que ha realizado al bombardear un
punto*/
void mensa (char menu);

/*adios.c
Funcion que se encargara de la saida anticipada del programa por parte del
usuario.*/
void adios (void);
