import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { loadRootEnv } from './infrastructure/config/root-env.js';

// Fixed loopback binding (TECHNOLOGY_ARCHITECTURE §5, decision D4).
const API_HOST = '127.0.0.1';
const API_PORT = 3000;

loadRootEnv();

const app = await NestFactory.create(AppModule);
app.setGlobalPrefix('api/v1');
app.enableShutdownHooks();
await app.listen(API_PORT, API_HOST);
console.log(`TB API listening on http://${API_HOST}:${API_PORT}/api/v1`);
