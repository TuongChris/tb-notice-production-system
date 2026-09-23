# TB Notice Production System — Database Schema v1 + API Contract v1

**Release:** `TB-SCHEMA-API-v1.0.0`  
**Design date:** 23/09/2026  
**Scope:** LOCAL-FIRST; hai PC Windows; chưa triển khai ứng dụng hoặc database.  
**Artifact status:** Đặc tả + schema + hợp đồng API + kiểm tra tĩnh/tham chiếu. Không phải ứng dụng có thể chạy ngay.

## Đọc từ đâu?

| File | Vai trò |
|---|---|
| [Bản tổng quan tiếng Việt](docs/OVERVIEW_VI.md) | Quyết định thiết kế, luồng chính, giới hạn và bước thực thi tiếp theo |
| [Database field dictionary](docs/DATABASE_SCHEMA_v1.md) | Từng bảng, trường, NULL/default, unique/index và FK |
| [Prisma schema](prisma/schema.prisma) | 33 model khai báo; phải validate bằng toolchain Prisma đã cài |
| [API Contract](docs/API_CONTRACT_v1.md) | HTTP, session/CSRF, concurrency, idempotency, nghiệp vụ và endpoint matrix |
| [OpenAPI YAML](contracts/openapi.yaml) | Hợp đồng request/response để triển khai frontend/backend |
| [Invariants](docs/INVARIANTS.md) | Quy tắc bắt buộc ở service/transaction; schema hợp lệ chưa đủ |
| [Acceptance scenarios](docs/ACCEPTANCE_TESTS.md) | 60 tình huống ứng dụng dự kiến, **chưa chạy** |
| [Handoff Claude Code](docs/LOCAL_FIRST_HANDOFF.md) | Thứ tự sử dụng gói này và bước local đầu tiên |
| [Verification](verification/VERIFICATION.json) | Kết quả đã thực hiện và những phần chưa kiểm được |
| [Sources](docs/SOURCES.md) | Nguồn kỹ thuật/control và phân biệt nguồn với quyết định thiết kế |

## Điều quan trọng nhất

Sản phẩm kết thúc ở **form unsigned được chuẩn bị cho người ký**. Người gửi dự kiến cũng là người ký; việc review/adopt/sign/send thực tế vẫn ở ngoài phần mềm.

`ValidationRun = TECHNICAL_PASS` **không** tự tạo `READY_FOR_SIGNER`. Kết quả bàn giao này còn cần các đánh giá G1–G6 có nguồn, đúng scope, đúng phiên bản form và dữ liệu hiện hành. Không có endpoint tạo G7, ký hay gửi.

Google Drive giữ hồ sơ/bằng chứng canonical. Database app giữ dữ liệu tác nghiệp, nguồn tham chiếu, snapshot và lịch sử ứng dụng; metadata mới nhập không tự trở thành chứng cứ pháp lý.

## Có gì trong gói?

- Schema Prisma v7-layout, MySQL8.4 target và file config/env mẫu không chứa secret.
- SQL **preview** để đối chiếu; không giả là migration do Prisma tạo hoặc đã áp dụng.
- OpenAPI3.1.1, JSONSchema bundle, TypeScript types, Zod adapters và endpoint/model catalog.
- Hàm tham chiếu thuần + tests cho hashing, encoding, mốc thời gian, same-scope và pending signature slot.
- Tài liệu chi tiết và kế hoạch nghiệm thu ứng dụng.

Các file OpenAPI/schema/catalog/types mô tả một hợp đồng thống nhất. Không sửa từng bản theo các hướng khác nhau. Giai đoạn bootstrap phải đưa quy trình generate/check vào repository thực, có dependencies đã khóa. Python trong `tests/verify_contracts.py` là công cụ kiểm tra đặc tả của gói bàn giao, **không phải backend Python** và không bắt buộc đưa Python vào application runtime.

## Những kiểm tra đã chạy

- 46/46 offline structural/schema checks.
- 27/27 Node pure-reference helper tests.
- TypeScript strict typecheck cho `contracts/api.types.ts`.
- Zod adapter: syntax transpilation không có lỗi; chưa typecheck/run với package Zod thực.

Không có Prisma CLI, MySQL hay Docker trong môi trường soạn gói. npm registry không phân giải DNS được. Vì thế **chưa có Prisma validation, migration thực, API server, browser E2E hoặc xác minh trên hai PC Windows**.

## Không chạy nhầm

Không có `yarn dev` hay application `package.json` trong gói: đó là output của bước repository bootstrap sau này. Đừng chạy SQL preview lên dữ liệu thật. Không import dữ liệu riêng tư, LOA, raw mail, canonical case facts hoặc production secrets vào fixtures/repo Git.

Prisma config trong gói ở root, trỏ `prisma/schema.prisma`. Khi đưa vào monorepo, đặt config ở `apps/api/prisma.config.ts` và schema ở `apps/api/prisma/schema.prisma`.

## Phạm vi triển khai tiếp theo

Claude Code thực hiện **P0: repository + toolchain + local MySQL migration rehearsal**, chưa triển khai toàn bộ 141 operation cùng lúc. `141 operation` bao gồm GET/list/detail/create/update/lifecycle và các contract hỗ trợ, không phải 141 màn hình hay microservice.

Một máy tạo migration mới; commit/push migration và lockfile. Máy còn lại pull rồi **áp dụng migration đã có**, không phát minh lại cùng migration. Hai local database không tự đồng bộ row dữ liệu.

Không có deployment, email send, external submission hoặc quyền ký được tạo từ gói này.
