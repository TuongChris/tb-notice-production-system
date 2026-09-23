import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module.js';
import { loadRootEnv } from './infrastructure/config/root-env.js';
import { configureApp } from './infrastructure/http/configure-app.js';

// Fixed loopback binding (TECHNOLOGY_ARCHITECTURE §5, decision D4).
const API_HOST = '127.0.0.1';
const API_PORT = 3000;

loadRootEnv();

// bodyParser: false — configureApp registers the JSON parser after the origin/content-type policy.
const app = await NestFactory.create<NestExpressApplication>(AppModule, { bodyParser: false });
configureApp(app);
app.enableShutdownHooks();
await app.listen(API_PORT, API_HOST);
console.log(`TB API listening on http://${API_HOST}:${API_PORT}/api/v1`);
