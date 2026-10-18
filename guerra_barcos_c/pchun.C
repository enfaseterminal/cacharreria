/**************************************************************************
pchun.c
Fucion que recoge y memoriza la posicion de los barcos del ordenador
**************************************************************************/

# include "barcos.h"

int pchun (int control,char mapa [COR][COR],char mapa2 [COR][COR],int x,int y,int ole, char car)
{
	static int 	acor [ACOR][2],	//Arrays para almacenar las coordenadas de los barcos
					c_acor,           //Contadores
					por1 [POR][2],
					c_por1,
					por2 [POR][2],
					c_por2,
					des1 [DES][2],
					c_des1,
					des2 [DES][2],
					c_des2,
					des3 [DES][2],
					c_des3;
	int 	c,i,					 		//Contadores
			cuantos,						//Retorna el valor que cuenta cuantos barcos le quedan
			listo=0;	               //Variable para control

	/*Como se almacenaran las coordenadas para por ejemlo acor

									0 1 2 3
							x	 0
							y	 1											*/
	switch (control)
	{
		case 0:        //Almacena las coordenadas de los barcos

			switch (ole)
			{
				case 4:
					acor [c_acor][0]=x;
					acor [c_acor][1]=y;
					c_acor++;
					break;
				case 3:
					if (c_por1<POR)
					{
						por1 [c_por1][0]=x;
						por1 [c_por1][1]=y;
						c_por1++;
					}else
					{
						por2 [c_por2][0]=x;
						por2 [c_por2][1]=y;
						c_por2++;
					}
					break;
				case 2:
					if (c_des1<DES)
					{
						des1 [c_des1][0]=x;
						des1 [c_des1][1]=y;
						c_des1++;
					}else
					{
						if (c_des2<DES)
						{
							des2 [c_des2][0]=x;
							des2 [c_des2][1]=y;
							c_des2++;
						}else
						{
							des3 [c_des3][0]=x;
							des3 [c_des3][1]=y;
							c_des3++;
						}
					}
					break;
			}
		break;

		case 1:		//Comprueba que barco ha sido tocado y mostrar el que ha sido hundido

		switch (car)
		{
			case 'A':
				c_acor--;         //Contador de piezas
				if (c_acor!=0)
					mapa2[x][y]=mapa [x][y]=TOC;
				else              //solo entra si han sido tocados todas las piezas
				{
					for (i=0;i<ACOR;i++)
					{
						mapa [acor[i][0]][acor[i][1]]=HUN;
						pin_agua (acor[i][0],acor[i][1],mapa);	//Pinta agua alrededor del barco
						mapa2 [acor[i][0]][acor[i][1]]=HUN;
						pin_agua (acor[i][0],acor[i][1],mapa2);	//Pinta agua alrededor del barco
					}
				}
				break;
			case 'P':
				if (c_por1>0)
				{
					for (c=0;c<POR;c++)
					{
						if ((por1 [c][0]==x)&&(por1 [c][1]==y))
						{
							listo=1;
							c_por1--;
							c=POR;
							if (c_por1!=0)
								mapa2[x][y]=mapa [x][y]=TOC;
							else
							{
								for (i=0;i<POR;i++)
								{
									mapa [por1[i][0]][por1[i][1]]=HUN;
									pin_agua (por1[i][0],por1[i][1],mapa);
									mapa2 [por1[i][0]][por1[i][1]]=HUN;
									pin_agua (por1[i][0],por1[i][1],mapa2);	//Pinta agua alrededor del barco
								}
							}
						}
					}
				}
				if (c_por2>0&&!listo)
				{
					for (c=0;c<POR;c++)
					{
						if ((por2 [c][0]==x)&&(por2 [c][1]==y))
					{
							c_por2--;
							c=POR;
							if (c_por2!=0)
								mapa2[x][y]=mapa [x][y]=TOC;
							else
							{
								for (i=0;i<POR;i++)
								{
									mapa [por2[i][0]][por2[i][1]]=HUN;
									pin_agua (por2[i][0],por2[i][1],mapa);
									mapa2 [por2[i][0]][por2[i][1]]=HUN;
									pin_agua (por2[i][0],por2[i][1],mapa2);	//Pinta agua alrededor del barco
								}
							}
						}
					}
				}
				break;
			case 'D':
				if (c_des1>0)
				{
					for (c=0;c<DES;c++)
					{
						if ((des1 [c][0]==x)&&(des1 [c][1]==y))
						{
							c_des1--;
							listo=1;
							c=DES;
							if (c_des1!=0)
								mapa2[x][y]=mapa [x][y]=TOC;
							else
							{
								for (i=0;i<DES;i++)
								{
									mapa [des1[i][0]][des1[i][1]]=HUN;
									pin_agua (des1[i][0],des1[i][1],mapa);
									mapa2 [des1[i][0]][des1[i][1]]=HUN;
									pin_agua (des1[i][0],des1[i][1],mapa2);	//Pinta agua alrededor del barco
								}
							}
						}
					}
				}
				if (c_des2>0&&!listo)
				{
					for (c=0;c<DES;c++)
					{
						if ((des2 [c][0]==x)&&(des2 [c][1]==y))
						{
							c_des2--;
							listo=1;
							c=DES;
							if (c_des2!=0)
								mapa2[x][y]=mapa [x][y]=TOC;
							else
							{
								for (i=0;i<DES;i++)
								{
									mapa[des2[i][0]][des2[i][1]]=HUN;
									pin_agua (des2[i][0],des2[i][1],mapa);
									mapa2 [des2[i][0]][des2[i][1]]=HUN;
									pin_agua (des2[i][0],des2[i][1],mapa2);	//Pinta agua alrededor del barco
								}
							}
						}
					}
				}
				if (c_des3>0&&!listo)
				{
					for (c=0;c<DES;c++)
					{
						if ((des3 [c][0]==x)&&(des3 [c][1]==y))
						{
							c_des3--;
							c=DES;
							if (c_des3!=0)
								mapa2[x][y]=mapa [x][y]=TOC;
							else
							{
								for (i=0;i<DES;i++)
								{
									mapa [des3[i][0]][des3[i][1]]=HUN;
									pin_agua (des3[i][0],des3[i][1],mapa);
									mapa2 [des3[i][0]][des3[i][1]]=HUN;
									pin_agua (des3[i][0],des3[i][1],mapa2);	//Pinta agua alrededor del barco
								}
							}
						}
					}
				}
				break;
		}
		break;

		case 2:
			switch (car)
			{
				case 'A':
					if (c_acor!=0)
						cuantos=1;
					else
						cuantos=0;
					break;

				case 'P':
					if (c_por1!=0&&c_por2!=0)
						cuantos=2;
					else
					{
						if (c_por1==0&&c_por2==0)
							cuantos=0;
						else
							cuantos=1;
					}
					break;

				case 'D':
					if (c_des1!=0&&c_des2!=0&&c_des3!=0)
						cuantos=3;
					else
					{
						if (c_des1==0&&c_des2==0&&c_des3==0)
							cuantos=0;
						else
						{
							if ((c_des1+c_des2+c_des3)<=3)
								cuantos=1;
							else
								cuantos=2;
						}
					}
					break;
			}
		break;

		case 3:		//Limpia los contadores para comenzar una nueva partida
			c_acor=c_por1=	c_por2=c_des1=c_des2=c_des3=0;
			break;
	}
	return cuantos;
}
