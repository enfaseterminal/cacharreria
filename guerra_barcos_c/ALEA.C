/*
alea.c
Determina de forma aleatoria la posicion del barco en el tablero
*/

#include "barcos.h"

void aleatorio (int *x, int *y)
{
	*x=random (COR);
	*y=random (COR);
	return;
}