import express from 'express';
import routes from './routes';
import { errorHandler, notFound } from './middleware/errors';

export const app = express();
app.use(express.json());
app.use(routes);
app.use(notFound);
app.use(errorHandler);
