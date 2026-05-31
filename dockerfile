# Etapa 1: Construcción (Build)
FROM node:20 AS build

# Establecemos el directorio de trabajo dentro del contenedor
WORKDIR /app

# Copiamos primero los archivos de dependencias para aprovechar la caché de Docker
COPY package.json package-lock.json* ./

# Instalamos las dependencias
RUN npm install

# Copiamos el resto del código del proyecto
COPY . .

# Construimos la aplicación para producción (Vite generará la carpeta 'dist')
RUN npm run build

# Etapa 2: Servidor Web de Producción (Serve)
FROM nginx:alpine

# Copiamos los archivos compilados desde la etapa anterior al servidor Nginx
COPY --from=build /app/dist /usr/share/nginx/html

# Exponemos el puerto 80 (el puerto por defecto de Nginx)
EXPOSE 80

# Iniciamos Nginx de forma que se mantenga en primer plano
CMD ["nginx", "-g", "daemon off;"]