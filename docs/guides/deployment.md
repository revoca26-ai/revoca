# Deployment Guide

Revoca is deployed 100% on **Amazon Web Services (AWS)** using modern, scalable, and secure cloud services:
* **Frontend:** AWS Amplify Hosting (Git-integrated static site hosting)
* **Backend API & Ingestion Worker:** AWS ECS Fargate (serverless container orchestration)
* **Database:** AWS RDS PostgreSQL (with pgvector support)
* **Cache:** AWS ElastiCache for Redis (for distributed rate-limiting)

## Deployment Architecture Diagram

```
                  ┌──────────────────────┐
                  │   AWS Route 53       │ (Domain & DNS)
                  └──────────┬───────────┘
                             │
            ┌────────────────┴────────────────┐
            ▼                                 ▼
   ┌──────────────────┐              ┌──────────────────┐
   │ AWS Amplify      │              │ AWS ALB          │ (Application Load Balancer)
   │ (React Frontend) │              └────────┬─────────┘
   └──────────────────┘                       │
                                    ┌─────────┴─────────┐
                                    ▼                   ▼
                          ┌──────────────────┐ ┌──────────────────┐
                          │ ECS Fargate API  │ │ ECS Fargate      │
                          │ (Express, HTTP)  │ │ Worker (Cron)    │
                          └────────┬─────────┘ └────────┬─────────┘
                                   │                    │
                                   └─────────┬──────────┘
                                             ▼
                                   ┌──────────────────┐
                                   │ AWS RDS Postgres │ (with pgvector)
                                   │ + ElastiCache    │ (Redis rate limits)
                                   └──────────────────┘
```

---

## Prerequisites

- AWS account with billing enabled and sufficient permissions (Admin/PowerUser).
- GitHub repository linked to your AWS account.
- Production Clerk instance configured.
- Production Google Cloud & Slack OAuth apps.
- Custom domain managed via **AWS Route 53** (e.g. `revoca.app`).
- API keys for:
  - OpenAI (Embeddings)
  - Google Gemini (Query rewrite & answers)
  - Cohere (Reranking)

---

## 1. Database — AWS RDS PostgreSQL

1. Go to the **Amazon RDS console** and click **Create database**.
2. Select **PostgreSQL** (version 15 or newer recommended).
3. Choose the **Free tier** or **Production/Dev-Test** template based on budget.
4. Set DB Instance Identifier (e.g. `revoca-prod`), Master Username, and Master Password.
5. In **Connectivity**:
   - Deploy inside your default VPC (or a dedicated custom VPC).
   - Set **Public access** to **No** (the API and Worker will connect privately).
   - Create a new security group (e.g., `revoca-db-sg`).
6. After creation, open the database client (from a bastion host or temporarily allowing your IP) and run:
   ```sql
   CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
   CREATE EXTENSION IF NOT EXISTS vector;
   ```
7. Retrieve the connection string format:
   `postgresql://<username>:<password>@<rds-endpoint>:5432/<database>?sslmode=require`

---

## 2. Cache — AWS ElastiCache for Redis

1. Go to the **Amazon ElastiCache console** and click **Create Redis cluster**.
2. Select **Configure and create a new cluster**.
3. Choose a node type (e.g., `cache.t4g.micro` is sufficient for MVP).
4. Deploy in the same VPC as the RDS instance.
5. Create/configure a security group (e.g., `revoca-redis-sg`) allowing inbound TCP port `6379` from the backend security group.
6. Retrieve the Redis endpoint URL: `redis://<elasticache-endpoint>:6379`

---

## 3. Backend Containers — AWS ECS Fargate

We containerize the monorepo and run the API and Worker services on AWS ECS (Elastic Container Service) with AWS Fargate.

### Dockerfile
Ensure you have a Dockerfile in the project root or backend directory that installs dependencies, builds the backend, and handles startup using the `ROLE` environment variable.

### 1. Create ECS Cluster
1. Navigate to the **Amazon ECS console**.
2. Click **Create cluster**, name it `revoca-prod-cluster`, and select **AWS Fargate (serverless)**.

### 2. Configure AWS ECR (Elastic Container Registry)
1. Go to **Amazon ECR** and create a private repository named `revoca-backend`.
2. Build and push your backend Docker image using the AWS CLI push commands:
   ```bash
   aws ecr get-login-password --region <region> | docker login --username AWS --password-stdin <aws_account_id>.dkr.ecr.<region>.amazonaws.com
   docker build -t revoca-backend -f backend/Dockerfile .
   docker tag revoca-backend:latest <aws_account_id>.dkr.ecr.<region>.amazonaws.com/revoca-backend:latest
   docker push <aws_account_id>.dkr.ecr.<region>.amazonaws.com/revoca-backend:latest
   ```

### 3. Task Definitions
Create a single Task Definition containing the backend container. We run two services using this definition but with different entry commands/roles.

1. **ECS console** → **Task definitions** → **Create new task definition** (Fargate).
2. Name: `revoca-backend-task`.
3. Container details:
   - Image URI: `<aws_account_id>.dkr.ecr.<region>.amazonaws.com/revoca-backend:latest`
   - Port mappings: Add port `3000` (TCP).
   - Environment variables: Configure variables matching the [Environment Variables Guide](../backend/environment.md). Key values include:
     - `NODE_ENV` = `production`
     - `DATABASE_URL` = RDS pooled connection string
     - `REDIS_URL` = ElastiCache endpoint
     - `GEMINI_API_KEY` = Your Google Gemini key
     - `OPENAI_API_KEY` = Your OpenAI key
     - `COHERE_API_KEY` = Your Cohere key
     - `FRONTEND_URL` = `https://app.revoca.app`

### 4. Create ECS Services
We deploy the Task Definition as two separate services in our cluster:

#### Service A: Backend API (`ROLE=api`)
1. Create a service under the cluster `revoca-prod-cluster`.
2. Launch type: **Fargate**.
3. Name: `revoca-api-service`.
4. Desired tasks: `2` (for horizontal scaling and high availability).
5. Environment override: Set `ROLE` = `api`.
6. **Load Balancing:**
   - Create an **Application Load Balancer (ALB)** (e.g. `revoca-alb`) listening on port HTTPS (443) using an SSL Certificate from AWS Certificate Manager (ACM) for `api.revoca.app`.
   - Point the listener rule to a target group on port `3000` mapped to this service.
7. **Security Groups:** Allow inbound traffic on port `3000` from the ALB security group.

#### Service B: Ingestion Worker (`ROLE=worker`)
1. Create a service under the same cluster.
2. Launch type: **Fargate**.
3. Name: `revoca-worker-service`.
4. Desired tasks: `1` (strict task count of 1 to prevent double-firing jobs; protected by pg advisory locks).
5. Environment override: Set `ROLE` = `worker`.
6. **Load Balancing:** None (this is an internal worker).
7. **Security Groups:** Allow egress only (to query DB, Redis, and external APIs).

---

## 4. Frontend — AWS Amplify Hosting

1. Open the **AWS Amplify console** and click **Create new app** → **Host web app**.
2. Select **GitHub** and authorize access. Choose the `revoca` monorepo and your deployment branch (e.g. `main`).
3. Configure the App Build Settings:
   - Root directory: `frontend`
   - Framework: React (Vite)
   - Amplify build command settings (`amplify.yml`):
     ```yaml
     version: 1
     frontend:
       phases:
         preBuild:
           commands:
             - npm ci
         build:
           commands:
             - npm run build
       artifacts:
         baseDirectory: dist
         files:
           - '**/*'
       cache:
         paths:
           - node_modules/**/*
     ```
4. Set **Environment variables**:
   - `VITE_CLERK_PUBLISHABLE_KEY` = `pk_live_...`
   - `VITE_API_URL` = `https://api.revoca.app`
5. Click **Save and deploy**.
6. **Custom Domain:** Go to **Amplify** → **Domain management** → **Add domain** (e.g., `app.revoca.app`). Amplify will provision the SSL certificate and configure Route 53 rules.

---

## 5. Domain Routing (AWS Route 53)

Configure Route 53 record sets:
- Create an **A Record (Alias)** pointing `api.revoca.app` to the Application Load Balancer (ALB).
- Create a **CNAME / Alias Record** pointing `app.revoca.app` to the AWS Amplify deployment address (Amplify handles this automatically if you add the domain via Amplify settings).
- Update OAuth Redirect URIs in:
  - Google Cloud Console: `https://api.revoca.app/api/v1/integrations/google/callback`
  - Slack App Settings: `https://api.revoca.app/api/v1/integrations/slack/callback`
  - Clerk Dashboard: Allowed origin `https://app.revoca.app`

---

## Post-Deploy Checklist

- [ ] `GET https://api.revoca.app/health` returns `{ "status": "ok" }`
- [ ] Frontend loads securely at `https://app.revoca.app`
- [ ] Sign up / sign in works via Clerk integration
- [ ] Connect Slack works (verifies oauth_states and redirects back to frontend)
- [ ] Connect Google Drive / Gmail succeeds
- [ ] Asking a question streams back letters in real-time (SSE) with source chips
- [ ] Next morning email digest delivered successfully
- [ ] Webhook triggers (Clerk, Slack Events API) receive raw payloads and verify signatures

---

## Rollback

* **Frontend (Amplify):** Under Amplify App console → **Deployments** → Select previous deployment → **Rollback**.
* **Backend API & Worker (ECS):** Tag the previous stable Docker image as `latest` in ECR, push it, and force a new deployment on the services:
  ```bash
  aws ecs update-service --cluster revoca-prod-cluster --service revoca-api-service --force-new-deployment
  aws ecs update-service --cluster revoca-prod-cluster --service revoca-worker-service --force-new-deployment
  ```

---

## Monitoring & Logging

* **Application logs:** Export ECS Fargate standard output/error to **Amazon CloudWatch logs** under the log group `/ecs/revoca-backend`.
* **Database performance:** Monitor RDS CPU, memory, and connections on the RDS Monitoring tab.
* **Alerting:** Configure CloudWatch alarms to trigger SNS alerts (to email/Slack) if:
  - The API service ALB returns high rates of `5XX` responses.
  - The API health check endpoint fails three consecutive times.
  - CPU usage on the RDS or ECS tasks exceeds 85%.
* **Amplify Analytics:** Track frontend load speeds and client-side error metrics.
