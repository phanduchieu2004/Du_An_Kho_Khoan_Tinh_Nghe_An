<p align="center">
  <a href="http://nestjs.com/" target="blank"><img src="https://nestjs.com/img/logo-small.svg" width="120" alt="Nest Logo" /></a>
</p>

[circleci-image]: https://img.shields.io/circleci/build/github/nestjs/nest/master?token=abc123def456
[circleci-url]: https://circleci.com/gh/nestjs/nest

  <p align="center">A progressive <a href="http://nodejs.org" target="_blank">Node.js</a> framework for building efficient and scalable server-side applications.</p>
    <p align="center">
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/v/@nestjs/core.svg" alt="NPM Version" /></a>
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/l/@nestjs/core.svg" alt="Package License" /></a>
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/dm/@nestjs/common.svg" alt="NPM Downloads" /></a>
<a href="https://circleci.com/gh/nestjs/nest" target="_blank"><img src="https://img.shields.io/circleci/build/github/nestjs/nest/master" alt="CircleCI" /></a>
<a href="https://discord.gg/G7Qnnhy" target="_blank"><img src="https://img.shields.io/badge/discord-online-brightgreen.svg" alt="Discord"/></a>
<a href="https://opencollective.com/nest#backer" target="_blank"><img src="https://opencollective.com/nest/backers/badge.svg" alt="Backers on Open Collective" /></a>
<a href="https://opencollective.com/nest#sponsor" target="_blank"><img src="https://opencollective.com/nest/sponsors/badge.svg" alt="Sponsors on Open Collective" /></a>
  <a href="https://paypal.me/kamilmysliwiec" target="_blank"><img src="https://img.shields.io/badge/Donate-PayPal-ff3f59.svg" alt="Donate us"/></a>
    <a href="https://opencollective.com/nest#sponsor"  target="_blank"><img src="https://img.shields.io/badge/Support%20us-Open%20Collective-41B883.svg" alt="Support us"></a>
  <a href="https://twitter.com/nestframework" target="_blank"><img src="https://img.shields.io/twitter/follow/nestframework.svg?style=social&label=Follow" alt="Follow us on Twitter"></a>
</p>
  <!--[![Backers on Open Collective](https://opencollective.com/nest/backers/badge.svg)](https://opencollective.com/nest#backer)
  [![Sponsors on Open Collective](https://opencollective.com/nest/sponsors/badge.svg)](https://opencollective.com/nest#sponsor)-->

## Description

[Nest](https://github.com/nestjs/nest) framework TypeScript starter repository.

## Project setup

```bash
$ npm install
```

## Database configuration

Copy `.env.example` to `.env` and set `DB_PASSWORD` to the password for your
PostgreSQL account. The application loads `.env` locally; deployment
environments should provide the same `DB_*` variables directly. Do not commit
`.env` or uploaded files.

## Export consolidated data

Use the download button on the map page or request `/xuat-file/tong-hop` to
download an Excel workbook. It contains a summary sheet and a separate sheet
for each application data table; columns marked as hidden, including passwords,
are not exported.

## Project attachments

The project creation form stores uploaded files in `uploads/cong-trinh/` and their
metadata in PostgreSQL. Since TypeORM schema synchronization is disabled, apply
the additive table migration once before using file uploads:

```bash
psql -d ho_khoan_na -f src/co-so-du-lieu/lich-su-chuyen-doi/20261016-tao-cong-trinh-tai-lieu.sql
```

## Sign in

Open `/dang-nhap` and use the existing database accounts for their assigned
portals: `kysu01`, `admin`, or `nguoixem01`. Existing plaintext passwords are
converted to scrypt hashes after a successful sign-in. Set a stable
`AUTH_SESSION_SECRET` in the environment for deployments; without it, sessions
are invalidated when the application restarts.

New users can register from the Kỹ sư and Người xem bản đồ sign-in pages.
Self-registration grants only the selected portal; administrator accounts must
be created by an administrator.

## Account portal access

Apply the account-access migration once to add portal assignments and the
login-enabled flag:

```bash
psql -d ho_khoan_na -f src/co-so-du-lieu/lich-su-chuyen-doi/20261021-quan-ly-quyen-cong-nguoi-dung.sql
```

Administrators can manage accounts at `/nguoi-dung`. An account may be assigned
one or more login portals and disabled without deleting it. Passwords are
write-only; a blank password field keeps the current password unchanged.

The app creates the system-wide authorization settings table on startup if it
does not exist. To create it manually instead, apply the migration:

```bash
psql -d ho_khoan_na -f src/co-so-du-lieu/lich-su-chuyen-doi/20261024-tao-uy-quyen-he-thong.sql
```

Administrators can select a portal and open its account list at
`/nguoi-dung/uy-quyen`, then configure function access for each account.
For each function, choose one account-specific mode: “Cho phép” allows the
function even when it is disabled system-wide; “Ngăn chặn” allows viewing,
preview, and export requests but blocks write requests; “Cấm” blocks all
requests; and “Cấp quyền”
uses the existing grant behavior and still requires the function to be enabled
system-wide. These settings do not bypass role or account checks. Accounts
without an individual configuration retain the shared system defaults.
Administrators can also choose which supported pages show a shortcut button to
each function.

To enable the `Quản lý khu vực` portal, an administrator assigns that portal
and sets the manager's assigned-area name, pinned point, and boundary on the
account form. The manager can view, update profile and login status, reset
passwords, or remove Kỹ sư and Người xem bản đồ accounts whose pinned points
are within that boundary. Managers cannot create accounts, change account
roles or assigned areas, or manage administrators and other managers.

On the separate administrator allocation page (`/cong-trinh/phan-bo`), select
select an enabled engineer, choose up to 20 projects, and set a start and end
date for each project. The proposed boundary is previewed automatically when
the selection and dates are valid; confirm to save the allocation. The app
takes an interior coordinate from a valid surface boundary in each selected
project to identify its ward, using the project address as a fallback if
reverse lookup is unavailable. If a ward boundary is unavailable, it falls
back to the containing city/district or province boundary, matching the
administrative-area choices on the account map. It merges the resolved
boundaries and pins the first selected project's surface coordinate. If a
surface coordinate is stored as longitude/latitude instead of latitude/
longitude, the allocation detects and swaps the values before lookup and
pinning. If a project has no valid surface coordinate or no containing
administrative boundary can be resolved, the allocation is rejected without
changing the engineer's area. Each project assignment is saved independently
and grants project access only during its date range. Admins can mark active
assignments complete from the engineer's progress list; the completion rate
is completed assignments divided by completed plus currently active
assignments.

Apply the project assignment migration once before opening the allocation
page:
`src/co-so-du-lieu/lich-su-chuyen-doi/20261023-tao-phan-cong-cong-trinh-ky-su.sql`.

For existing databases, apply the assignment status migration to show whether
an engineer has been allocated and to mark each new assignment as "Đã phân bổ":

```bash
psql -d ho_khoan_na -f src/co-so-du-lieu/lich-su-chuyen-doi/20261027-them-trang-thai-phan-bo-cong-trinh.sql
```

Apply the project approval migration once to enable pending approval for newly
created projects. Existing projects remain approved:

```bash
psql -d ho_khoan_na -f src/co-so-du-lieu/lich-su-chuyen-doi/20261023-them-trang-thai-duyet-cong-trinh.sql
```

Apply the project creator migration to let engineers see the projects they
created in the engineer portal:

```bash
psql -d ho_khoan_na -f src/co-so-du-lieu/lich-su-chuyen-doi/20261023-them-nguoi-tao-cong-trinh.sql
```

Apply the assignment cancellation-request migration to store engineer
cancellation requests until an administrator approves them:

```bash
psql -d ho_khoan_na -f src/co-so-du-lieu/lich-su-chuyen-doi/20261023-tao-yeu-cau-huy-phan-cong.sql
```

Apply the assignment-renewal migration to store engineer requests to extend
overdue project assignments. The new end date is applied only after admin approval:

```bash
psql -d ho_khoan_na -f src/co-so-du-lieu/lich-su-chuyen-doi/20261026-tao-yeu-cau-gia-han-phan-cong.sql
```

The application creates the project edit-approval table and indexes
automatically at startup. If your deployment applies database changes
separately, you can apply the same idempotent migration before deploying.
Submitted changes remain pending and do not replace the current project details
until an administrator approves them; the project edit history shows pending
and approved requests:

```bash
psql -d ho_khoan_na -f src/co-so-du-lieu/lich-su-chuyen-doi/20261026-tao-duyet-sua-va-lich-su-cong-trinh.sql
```

The application creates the level-two-to-four survey approval table and
parent-area references at startup. For deployments that apply database changes
separately, apply the migration before deploying:

```bash
psql -d ho_khoan_na -f src/co-so-du-lieu/lich-su-chuyen-doi/20261026-tao-duyet-mat-bang-cap-2.sql
```

The approval page groups pending projects and level-two, level-three, and
level-four area requests into separate tabs. An area request must select a
parent area from the previous level and remains pending until approved.

## Engineer assigned areas

Apply the assigned-area migration once to store the pinned coordinates and
administrative boundary for each engineer:

```bash
psql -d ho_khoan_na -f src/co-so-du-lieu/lich-su-chuyen-doi/20261023-luu-khu-vuc-phan-cong-ky-su.sql
```

Apply the assignment-period migration to enable optional start and end dates
for engineer area assignments:

```bash
psql -d ho_khoan_na -f src/co-so-du-lieu/lich-su-chuyen-doi/20261024-them-thoi-han-phan-cong-ky-su.sql
```

When configured, both dates are required. Engineers can access assigned work
from the start date through the end of the end date in Vietnam time. Leaving
both dates blank keeps the assignment unrestricted by date.

The base map is available without signing in. Map exploration tools require a
map viewer, engineer, or administrator account; data-management and export
tools require an engineer or administrator; user and role management is
administrator-only. These restrictions are enforced by both the map controls
and server routes.

The project detail page provides an Excel export beside the edit button. The
workbook includes a sheet for every displayed project-data section; sections
without records still include their column headers.

## Map search land boundaries

Search results on the map are limited to Vietnam. Area boundaries are
intersected with `public/du-lieu/ranh-gioi-viet-nam.geojson` so offshore portions are
excluded. That land geometry is from Natural Earth 1:10m Admin 0 Countries
(public domain): https://www.naturalearthdata.com/downloads/10m-cultural-vectors/10m-admin-0-countries/

Search a named location as usual, or search tourist attractions with queries
such as `du lịch Đà Nẵng`. Tourist places are read from OpenStreetMap via
Overpass API, limited to 200 results per search, and filtered to points on
Vietnam land.

## Compile and run the project

```bash
# development
$ npm run start

# watch mode
$ npm run start:dev

# production mode
$ npm run start:prod
```

The default port is `3000`. The app uses this port unless `PORT` is set. If
the selected port is occupied, stop the existing app instance before starting
another one. To use a different port explicitly in PowerShell:

```powershell
$env:PORT=3001; npm run start:dev
```

To identify the process listening on port 3000 before stopping it:

```powershell
Get-NetTCPConnection -LocalPort 3000 -State Listen |
  Select-Object LocalAddress, LocalPort, OwningProcess
Get-Process -Id <PID>
```

Only stop the process after confirming it belongs to this application. The
`PORT` value must be an integer from `1` to `65535`.

## Run tests

```bash
# unit tests
$ npm run test

# e2e tests
$ npm run test:e2e

# test coverage
$ npm run test:cov
```

## Deployment

When you're ready to deploy your NestJS application to production, there are some key steps you can take to ensure it runs as efficiently as possible. Check out the [deployment documentation](https://docs.nestjs.com/deployment) for more information.

If you are looking for a cloud-based platform to deploy your NestJS application, check out [Mau](https://mau.nestjs.com), our official platform for deploying NestJS applications on AWS. Mau makes deployment straightforward and fast, requiring just a few simple steps:

```bash
$ npm install -g @nestjs/mau
$ mau deploy
```

With Mau, you can deploy your application in just a few clicks, allowing you to focus on building features rather than managing infrastructure.

## Observability

In production applications, observability is essential for understanding how your system behaves, detecting issues early, and maintaining reliable performance.

[NestJS Observe](https://observe.nestjs.com) automatically instruments your NestJS application, giving you deep visibility into your system with minimal setup:

- **Distributed tracing:** Follow requests across services and understand how they flow through your system.
- **Waterfall analysis:** Visualize request execution and identify slow operations, bottlenecks, and unexpected delays.
- **Performance analysis:** Analyze application performance in real time and quickly pinpoint areas that need optimization.
- **Metrics:** Track key application and infrastructure metrics to understand system health and performance trends.
- **Logging:** Centralize and correlate logs with traces and other telemetry to make debugging easier.
- **Error tracking:** Detect errors quickly and investigate their root causes with the surrounding context.
- **SLA monitoring:** Track service-level objectives and identify when your application is approaching or exceeding defined thresholds.
- **Alarms and alerts:** Set up alerts for critical errors, performance degradation, SLA violations, and other anomalies so your team can react quickly.

This project is already instrumented. Create a free account at [observe.nestjs.com](https://observe.nestjs.com), add an application, and paste the generated app key and secret into the `ObserveModule.forRoot()` call in `src/ung-dung.module.ts`.

The free plan needs no payment details and covers 300,000 events a month. You can also browse the [live demo](https://www.observe-demo.nestjs.com/dashboard) first - the whole dashboard over a busy service's data, with nothing to install.

## Resources

Check out a few resources that may come in handy when working with NestJS:

- Visit the [NestJS Documentation](https://docs.nestjs.com) to learn more about the framework.
- For questions and support, please visit our [Discord channel](https://discord.gg/G7Qnnhy).
- To dive deeper and get more hands-on experience, check out our official video [courses](https://courses.nestjs.com/).
- Deploy your application to AWS with the help of [NestJS Mau](https://mau.nestjs.com) in just a few clicks.
- Auto-instrument your application with [NestJS Observe](https://observe.nestjs.com). Distributed tracing, metrics, and logging made easy. Error tracking and performance monitoring for your NestJS applications.
- Visualize your application graph and interact with the NestJS application in real-time using [NestJS Devtools](https://devtools.nestjs.com).
- Need help with your project (part-time to full-time)? Check out our official [enterprise support](https://enterprise.nestjs.com).
- To stay in the loop and get updates, follow us on [X](https://x.com/nestframework) and [LinkedIn](https://linkedin.com/company/nestjs).
- Looking for a job, or have a job to offer? Check out our official [Jobs board](https://jobs.nestjs.com).

## Support

Nest is an MIT-licensed open source project. It can grow thanks to the sponsors and support by the amazing backers. If you'd like to join them, please [read more here](https://docs.nestjs.com/support).

## Stay in touch

- Author - [Kamil Myśliwiec](https://twitter.com/kammysliwiec)
- Website - [https://nestjs.com](https://nestjs.com/)
- Twitter - [@nestframework](https://twitter.com/nestframework)

## License

Nest is [MIT licensed](https://github.com/nestjs/nest/blob/master/LICENSE).
