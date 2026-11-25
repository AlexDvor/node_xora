import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import type { FastifyInstance } from 'fastify';

export async function registerDocumentation(app: FastifyInstance) {
  // Register before application routes so OpenAPI discovers their runtime schemas.
  await app.register(swagger, {
    openapi: {
      openapi: '3.0.3',
      info: {
        title: 'NodeXora Monitoring API',
        version: '0.1.0',
        description: 'Read-only Debian monitoring for local development.',
      },
      servers: [{ url: '/', description: 'Current server' }],
      tags: [
        { name: 'Health', description: 'API availability' },
        { name: 'System', description: 'System resource monitoring' },
      ],
    },
  });
  await app.register(swaggerUi, {
    routePrefix: '/api',
    staticCSP: true,
    // LAN development currently uses HTTP; do not upgrade its asset URLs to HTTPS.
    transformStaticCSP: (header) => header.replace('upgrade-insecure-requests;', ''),
    uiConfig: {
      docExpansion: 'list',
      deepLinking: true,
      validatorUrl: null,
    },
  });
  app.get('/', { schema: { hide: true } }, async (_request, reply) => reply.redirect('/api/'));
}
