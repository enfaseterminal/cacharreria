/**************************************************************************
barcos.c
Juego que simula un partida de guerra barcos entre el usuario contra el PC
**************************************************************************/

# include "barcos.h"

int barcos (void)
{
	char  mapa_usu [COR][COR],   	//Mapa del jugador
			mapa_pc [COR][COR],    	//Mapa del PC
			estrage [COR][COR],		//Mapa de la estrategia seguida por el usuario
			p;								//Recoge contestacion
	int   x,y,							//Variables que recogen las coodenadas
			cor_x,cor_y,				//Variables que recogen las coodenadas (de reserva)
			control,						//Variable para el control de aciertos
			c_usu,				 		//Variables que recogeran cada turno
			con_por=4,					//Contador de porta-aviones hundidos
			c,i=0,								//Contador
			alarma=0,					//Determina que el PC ha echo blanco
			pie_usu=0,pie_pc=0;		//Contador del nuemro de piezas que han acertado cada uno

	randomize ();  //Inicializa una funci¢n que asigna un numero aleatorio

	/*Inicializaciones a cero de los tableros*/
	for (x=0;x<COR;x++)
		for (y=0;y<COR;y++)
			{
			mapa_usu[x][y]=' ';
			mapa_pc [x][y]=' ';
			estrage [x][y]=' ';
			}

	presen (1);	//¿Que quiere colocar los barcos o aleatoriamente
	/*determina el tablero del usuario*/
	do
	{
		fflush (stdin);
		scanf ("%c",&p);
		p= ((char)tolower (p));
		switch (p)
		{
			case 'b':
				pc (mapa_usu,0);       //Genera un tablero aleatoriamete para el usuario
				control=0;
				presen (4);
				break;
			case 'a':
				presen(3);
				usu (mapa_usu);			//Recoge los barcos del usuario, comprueba y los coloca
				control=0;
				break;
			case 'x':
				adios (); 					//Sale precipitadamente del programa
				control=1;
				break;
		default:
			error (0);
			control=1;
		}
	}while (control);
	clrscr ();
	printf ("\t\tLos barcos han quedado colocados de esta forma: ");
	dibu_ini (mapa_usu);
	printf ("\nPulsa una tecla para continuar");
	getch ();
	presen (5);
	/*El PC genera su tablero de forma aleatoria*/
	pc (mapa_pc,1);

	clrscr ();
	do
	{
		presen (6);
		fflush (stdin);
		scanf ("%c",&p);
		p= ((char)tolower (p));
		switch (p)
		{
			case 'a':
				c_usu=0;
				control=0;
				break;
			case 'b':
				c_usu=1;
				control=0;
				break;
			case 'x':
				adios (); 					//Sale precipitadamente del programa
				control=1;
            break;
		default:
			clrscr ();
			error (0);
			control=1;
		}
	}while (control);
	presen (7);
	p=random (2);

	switch (p)
	{
		case 0:
			presen (8);
			c=0;
			if (c==c_usu)
				presen (10);
			else
				presen (11);
			break;
		case 1:
			presen (9);
			c=1;
			if (c==c_usu)
				presen (10);
			else
				presen (11);
			break;
	}

	//Parte de la partida en si
	clrscr ();
	do
	{
	//Turno del usuario
	if (c_usu==c)
	{
		do
		{
			control=0;
			clrscr ();
			textcolor (15);
			textbackground(0);
			printf ("Tu turno:\n ");
			dibu2 (mapa_usu,estrage,con_por);
			coordenadas (&x,&y);

			clrscr ();
			printf ("Tu turno:\n ");
			dibu2 (mapa_usu,estrage,con_por);
			printf ("\nIntroduce coordenadas verticales ()y horizontales (): ");
			printf ("%c%i ",(char)(y+65),x+1);

			if (estrage [x][y]==TOC||estrage [x][y]==AGUA||estrage [x][y]==HUN)
				control=1;
			else
			{
				if (mapa_pc [x][y]==' ')
				{
					mapa_pc[x][y]=estrage [x][y]=AGUA;
					mensa (AGUA);
				}else
				{
					pie_pc++;				//El usuario a tocado una pieza del pc
					if (mapa_pc [x][y]=='S')
					{
						mapa_pc[x][y]=estrage [x][y]=HUN;
						con_por--;
						pin_agua (x,y,estrage);
					}else
						pchun (1,estrage,mapa_pc,x,y,0,mapa_pc [x][y]); //Busca que barco es el tocado y los pinta en ese mapa
					mensa (estrage[x][y]);
				}
			}
			if (control)
				{
				clrscr ();
				error(1);
				}
		}while (control);

	//Turno del ordenador
	}else
	{
		do
		{
			control=0;
			if (alarma==0)	//Si anteriormente no ha acertado ninguna posicion busca aleatoriamente
				aleatorio (&x,&y);
			else
			{
				ia(&cor_x,&cor_y,alarma);
				x=cor_x;
				y=cor_y;
			}
			if (mapa_usu [x][y]==TOC||mapa_usu [x][y]==AGUA||mapa_usu [x][y]==HUN)
			{
				control=1;
				if (i==4)	//Valvula de seguridad por si se crea un bucle
				{
					alarma=0;
					i=0;
				}
				if (alarma==1)	//Ha entrado una vez en ia ahora debera realizar otra busqueda
					alarma=2;	//Ha echo agua hay no debes mirar
				if (alarma==4)	//Anteriormente acerto y esta vez no
				{
					alarma=3;
					i++;
				}
			}
			else
			{
				clrscr ();
				textcolor (15);
				textbackground(0);
				printf ("Mi turno:\n ");
				dibu2 (mapa_usu,estrage,con_por);
				printf ("\nVoy a probar en las coordenadas: ");
				printf ("%c%i ",(char)(y+65),x+1);
				if (mapa_usu [x][y]==' ')
				{
					mapa_usu [x][y]=AGUA;
					mensa (AGUA);

					if (alarma==1)	//Ha entrado una vez en ia ahora debera realizar otra busqueda
						alarma=2;	//Ha echo agua hay no debes mirar
					if (alarma==4)	//Anteriormente acerto y esta vez no
						alarma=3;
				}else
				{
					pie_usu++;				//El ordenador a acertado
					if (mapa_usu [x][y]=='S')
					{
						mapa_usu [x][y]=HUN;
						pin_agua (x,y,mapa_usu);
						mensa (HUN);
					}else
					{
						usuhun (1,mapa_usu ,x,y,0,mapa_usu [x][y]);
						if (mapa_usu[x][y]!=HUN)	//Si el barco ha no ha sido hundido
						{
							if (alarma==0)
							{
								alarma=1;	//Dira a ia que comince la busqueda
								cor_x=x;		//Memoriza la ultima posicion atacada
								cor_y=y;
							}else
								alarma=4;	//Dira a ia que siga por hay que va bien
							mensa (TOC);
						}else        		//Si el barco ha sido hundido
						{
							alarma=0;
							mensa (HUN);
						}
					}
				}
			}
		}while (control);
	}
	c++;
	if (c==2)
		c=0;
	}while (pie_usu<PIE&&pie_pc<PIE);
	//La partida a acabado
	clrscr ();
	if (pie_usu==PIE)
	{
		printf ("Lo siento, has perdido");
		c=0;
	}else
	{
		printf ("Has ganado");
		c=1;
	}
	dibu2 (mapa_usu,mapa_pc,con_por);
	printf ("\nPulsa una tecla para continuar");
	getch ();
	//Limpia los contadores de los barcos hundidos por si acaso se comienza otra partida
	pchun (3,mapa_usu,mapa_pc,0,0,0,'a');
	usuhun (2,mapa_usu,0,0,0,'a');
	return c;
}
