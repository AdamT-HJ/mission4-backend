# Two stage dev for back end 

# FIRST STAGE build in node:alpine
#Using node:alpine build stage name 'build_stage_1'
FROM node:alpine AS build_stage_1
# working directory inside node:alpine root '/' of 'app'
WORKDIR /app
# copying package.json and package-lock.json
# ./ means current working dir. in this case 'app'
COPY package*.json ./

RUN npm install

#copy source code over to 1st stage build
COPY . .


#SECOND STAGE
#node:alpine again as needed for backend node js 
#static files created in first stage
FROM node:alpine

WORKDIR /app

# COPY package.json from 1st stage build
COPY --from=build_stage_1 /app/package.json ./

#install production dependencies, not dev dependencies that aren't needed
# in this case only 'nodemon'
RUN npm install --production

#COPY backend source code over to 2nd stage
COPY --from=build_stage_1 /app/src ./src
COPY --from=build_stage_1 /app/server.js ./server.js

# Creating sessions directory for backend session files
RUN mkdir -p sessions

#backend PORT
EXPOSE 5000

#CMD to start backend
CMD ["node", "server.js"]



