# **MiniCAD 2D 📐**

MiniCAD 2D es una aplicación web de diseño asistido por ordenador rápida, ligera y ejecutada enteramente en el navegador. Está construida con **React**, **Vite** y **Tailwind CSS**.  

Permite a los usuarios dibujar formas geométricas, gestionar capas, agrupar objetos en bloques reutilizables y trabajar con formatos estándar de la industria como DXF y SVG.  

## **✨ Características Principales**  

* **Herramientas de dibujo completas:** Líneas, polilíneas, rectángulos, círculos, arcos, lápiz libre y texto.    
* **Anotación y Medición:** Cotas lineales y cotas radiales.  
* **Sombreados (Hatch):** Soporte para múltiples patrones (líneas, cuadrícula, puntos, hormigón, tierra).  
* **Motor Osnap Inteligente:** Referencias automáticas a puntos finales, puntos medios, centros, intersecciones y perpendiculares.  
* **Gestión de Capas:** Oculta, muestra y cambia el color por defecto de diferentes grupos de objetos.  
* **Bloques Reutilizables:** Agrupa elementos, ponles un nombre y clónalos por todo el lienzo de forma eficiente.  
* **Edición Avanzada:** Herramientas de recorte (Trim) y alargamiento (Extend) hasta intersecciones.  
* **Importación y Exportación:** Soporte nativo para lectura y escritura de archivos **DXF** (AutoCAD), **SVG** (Vectores) y **JSON** (Respaldo del proyecto).  
* **Impresión a PDF:** Selecciona una ventana gráfica exacta y expórtala en alta resolución.

## **🚀 Cómo empezar**

Primero, descarga el código fuente del proyecto desde GitHub clonando el repositorio:

git clone \[https://github.com/jsbsan/minicad.git\](https://github.com/jsbsan/minicad.git)  
cd minicad

A partir de aquí, tienes dos opciones para ejecutar la aplicación:

### **Opción A: Entorno Local (Sin Docker)**

*Ideal para desarrolladores que quieran modificar el código fuente.*

**Requisitos previos:** Debes tener [Node.js](https://nodejs.org/) instalado en tu equipo.

1. Instala las dependencias del proyecto:  
   npm install

2. Inicia el servidor de desarrollo local:  
   npm run dev

3. Abre tu navegador web y visita: http://localhost:5173

### **Opción B: Usando Docker (Desde Docker Hub)**

*La forma más rápida de probar la aplicación sin instalar dependencias de programación.*

**Requisitos previos:** Debes tener [Docker Desktop](https://www.docker.com/) o el motor de Docker instalado y ejecutándose.

Si ya has subido la imagen oficial del proyecto a tu cuenta de Docker Hub, cualquier usuario puede ejecutar la aplicación con un solo comando, sin necesidad de compilar el código:

1. Ejecuta el siguiente comando en tu terminal para descargar e iniciar la aplicación:  
   docker run \-d \-p 8081:80 \--name minicad-minicad jsbsan/minicad-minicad:latest

  
2. Abre tu navegador web y visita: http://localhost:8081

Para detener la aplicación más tarde, simplemente ejecuta: docker stop minicad.

## **🛠 Tecnologías Utilizadas**

* **Frontend:** React.js (Hooks, Context)  
* **Build Tool:** Vite  
* **Estilos:** Tailwind CSS  
* **Iconos:** Lucide-React  
* **Renderizado gráfico:** HTML5 Canvas API nativa