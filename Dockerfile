FROM node:12.16.3-stretch

COPY . /code
WORKDIR /code

RUN yarn && yarn run build

CMD [ "yarn", "start" ]
