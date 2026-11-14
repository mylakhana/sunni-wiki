# API Project Rules

## Framework & Core
- **Framework:** Fastify (not Express)
- **Language:** TypeScript
- **Database:** MySQL + Prisma ORM
- **Port:** 3001 (API), 3002 (Prisma Studio)

## Architecture
- **Pattern:** Service-Oriented Architecture (SOA)
- Business logic in `services/`
- Route handlers in `routes/v1/`
- One file per route controller
- Validation schemas in `schemas/`

## API Versioning
- All routes under `/v1` prefix
- Use `routes/v1/` directory structure
- Example: `/v1/auth/login`, `/v1/profile/fetch`

## Validation
- Use Zod schemas for all request/response validation
- Use `fastify-type-provider-zod` for type-safe routes
- Define schemas in `schemas/` directory
- Install `fastify-zod-openapi` for Swagger integration
- Add `.describe('field description')` to all schema fields for documentation

## Database
- Prisma as ORM
- Schema in `prisma/schema.prisma`
- Run migrations before code changes
- Never commit raw SQL queries

---

## Error Handling
- Use Fastify error handling
- Return proper HTTP status codes
- Include error messages in responses
- Log errors with Pino

## Logging
- Use Pino logger (built into Fastify)
- Log important events and errors
- Use appropriate log levels

## Documentation
- OpenAPI 3.0 via `@fastify/swagger`
- Swagger UI at `/docs`
- Document all endpoints
- **Swagger + Zod Integration:**
  - Install packages: `fastify-zod-openapi` and `zod-openapi`
  - Register `fastifyZodOpenApiPlugin` before swagger
  - Add transformers to swagger config:
    ```ts
    transform: fastifyZodOpenApiTransform,
    transformObject: fastifyZodOpenApiTransformObject
    ```
  - Use `.describe()` on all Zod schema fields:
    ```ts
    export const schema = z.object({
      email: z.string().email().describe('User email address'),
      age: z.number().describe('User age')
    }).describe('Request body description');
    ```

## Code Organization
```
src/
├── config/         # Environment, Prisma client
├── routes/v1/      # API route handlers (versioned)
├── services/       # Business logic
├── schemas/        # Zod validation schemas
├── middleware/     # Custom middleware
└── index.ts        # App entry point
```

## Best Practices
- Keep routes thin, services thick
- One controller per file in `routes/v1/`
- Use dependency injection
- Separate concerns (routes → services → database)
- Type everything properly
