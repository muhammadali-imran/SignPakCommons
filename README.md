# SignPakCommons

Thank you to everyone who is helping build this project and contribute to the dataset. Your time, effort, and support are making a real difference for the deaf and hard-of-hearing community in Pakistan.

SignPakCommons is a community-driven initiative created to collect and organize Pakistan Sign Language (PSL) data for a better future of communication, accessibility, and inclusion. We believe that language should never be a barrier, and by building this open-source dataset, we are helping create tools that can support education, communication, and everyday digital access for people who use sign language.

This project is being developed by NUST students as part of our final year project, with a simple but powerful purpose: to build meaningful technology for people with hearing difficulties and make the world more inclusive for everyone.

Every sign, every video, and every contribution helps us move closer to a future where communication is easier, smarter, and more accessible. We are deeply grateful to everyone who contributes their time, recordings, feedback, and encouragement. Together, we are building something valuable for the people who need it most.

We also want to thank all contributors who are helping grow this dataset, improve the platform, and support this mission with their work and generosity. Your effort is helping create real impact and bringing long-term accessibility solutions to life.

## Run with Docker Compose

Requirements: Docker Engine or Docker Desktop with the Compose plugin.

```bash
cp .env.example .env
cp backend/.env.example backend/.env
```

Set `JWT_SECRET` and `ADMIN_PASSWORD` in `backend/.env` before starting. Generate the JWT secret with `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`. For production, set `NODE_ENV=production` and configure the required Brevo and Web3Forms credentials there as well.

Start the stack with `docker compose up --build`. The frontend is available at `http://localhost:8080`, the API at `http://localhost:5000`, and API docs at `http://localhost:5000/docs`. MongoDB and local uploads are stored in named Docker volumes. Set `FRONTEND_PORT`, `BACKEND_PORT`, and `CLIENT_ORIGIN` in the root `.env` to change the host ports or browser origin.

Stop the services with `docker compose down`. The named volumes are retained; `docker compose down -v` removes the database and uploaded files.
