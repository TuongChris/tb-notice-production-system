# Database Schema v1 + API Contract v1 — Tổng quan

**TB Notice Production System · TB-SCHEMA-API-v1.0.0 · 23/09/2026**

Đây là bản thiết kế triển khai dành cho Claude Code, tiếp nối Domain Model v1 và yêu cầu sản phẩm unsigned. Các quyết định chi tiết nằm trong schema/API và INVARIANTS; chúng chưa phải phần mềm đã chạy.

## 1. Quyết định nền

| Thành phần | Quyết định |
|---|---|
| Môi trường đầu tiên | Local trên hai PC Windows, độc lập database |
| Database target | MySQL8.4/InnoDB; không coi MariaDB tương đương tự động |
| ORM layout | Prisma7; URL nằm trong prisma.config.ts |
| API | REST `/api/v1`, OpenAPI3.1.1 |
| Định nghĩa API | JSONSchema catalog là nguồn định nghĩa; Zod/TypeScript là adapter được sinh |
| Authentication | Opaque session lưu hash trong DB; cookie + Origin/CSRF |
| Nguồn bằng chứng | Google Drive canonical, app giữ tham chiếu và provenance |
| Đầu ra cuối | Unsigned NoticeCandidate; signer review/adopt/sign/send ngoài app |

Không kế thừa các khẳng định chưa xác minh ở bản trước về major framework mới nhất. Bước bootstrap chọn/pin package tương thích thực tế và kiểm lại runtime.

## 2. Tám nhóm bảng

| Nhóm | Số bảng | Models |
|---|---:|---|
| Access | 2 | User, AuthSession |
| Directory và Route | 6 | Agency, Owner, LegalSubject, OwnerSubject, Signer, Route |
| Authority | 5 | Mandate, MandateVersion, MandateCoverage, CoverageSigner, AuthorityEvent |
| Case graph | 6 | CaseRecord, CaseAuthoritySelection, CaseAuthorityCoverage, ReportedItem, CaseWork, UseMapping |
| Facts và sources | 4 | SourceReference, CaseSource, CaseFact, FactSource |
| Correspondence | 2 | Correspondence, CorrespondenceBinding |
| Production và review | 6 | PromptSnapshot, NoticeCandidate, ValidationRun, ValidationIssue, CandidateAssessment, AssessmentSource |
| Audit và retry | 2 | AuditEvent, IdempotencyRecord |

Tổng 33 bảng. Nhiều bảng là liên kết hoặc snapshot nhỏ; không cần 33 menu. Vẫn một backend, một database, không queue infrastructure hoặc distributed workflow.

## 3. Những quan hệ không được làm sai

Owner là namespace khách hàng, LegalSubject là cá nhân/pháp nhân. OwnerSubject nối chúng nhiều–nhiều. Route duy nhất theo Agency + OwnerSubject + Platform; link chỉ tạo liên kết quản trị, không tạo authority.

MandateVersion có các coverage cho từng Route. CoverageSigner xác định phạm vi người ký. Một văn bản có thể hỗ trợ nhiều chủ thể nhưng không hợp nhất quyền của họ. Version được freeze trước khi được chọn; việc freeze chỉ khóa chỉnh sửa, không chứng nhận pháp lý.

CaseAuthoritySelection giữ lựa chọn mandate/coverage/signer cho công việc. Đổi signer mặc định trên Route không sửa lựa chọn/snapshot cũ. Case mang đúng agency, subject và platform; intake có thể còn thiếu canonical ID hoặc route, nhưng chỉ được preparation trong giới hạn đó.

ReportedItem và CaseWork thuộc case; UseMapping nối từng lần xuất hiện. Một work có thể xuất hiện nhiều lần trong một reported item. Không unique video toàn hệ thống; chỉ unique identifier trong cùng case và review overlap giữa các case.

## 4. Kiểu dữ liệu và bảo toàn lịch sử

UUID nội bộ tách khỏi mã canonical và reference của YouTube. UTC timestamps khác ngày ghi trên nguồn. Timecode lưu BIGINT unsigned milliseconds, ra JSON dưới dạng chuỗi số; giữ nguyên raw text. Thiếu endpoint thời gian là null chứ không phải 0.

SQL name dùng lowercase snake_case. Collation target utf8mb4_0900_bin để giữ phân biệt chữ hoa/thường của identifier. Candidate/prompt body được giữ nguyên UTF-8, không tự trim hoặc normalize; database không quyết định authenticity từ hash.

Agency/Owner và working config có rowVersion. Source captures, fact revisions, prompt và candidate giữ phiên bản. Nội dung form đã lưu không PATCH, tạo phiên bản mới. FK RESTRICT và service dependency guard ngăn xóa hồ sơ đã được dùng, kể cả tham chiếu trong snapshot JSON.

## 5. Mô hình form và readiness

`PromptSnapshot` = exact context/prompt đã đưa cho ChatGPT. `NoticeCandidate` = exact subject/body/envelope/prepared-document manifest nhận lại. `ValidationRun` = các technical checks thực sự chạy. `CandidateAssessment` = bản ghi đánh giá G1–G6 có nguồn và người thực hiện/nguồn gốc rõ ràng, không phải tự động legal verdict.

READY_FOR_SIGNER không là writable field. API tính lại từ exact artifact, current dependency digest, applicable ruleset, technical coverage và từng substantive assessment G1–G6. Missing, ERROR, unperformed review hay conflict không tự chuyển thành PASS. Có thể viện dẫn các đánh giá đã tồn tại đúng scope; không bắt owner ký lại chỉ để điền UI.

Ba hash có mục đích riêng:
- bodySha256: exact body text.
- artifactSha256: subject + body + envelope + document plan + pending signature slot.
- dependencyDigest: toàn bộ context/phạm vi/phiên bản nguồn và rule hiện hành liên quan.

Đổi recipient, authority, source context hoặc ruleset có thể làm validation cũ stale dù body vẫn giữ nguyên. Export luôn kiểm lại; replay một export cũ không vượt qua revocation mới.

## 6. Các endpoint trung tâm

| Nghiệp vụ | Endpoint mẫu |
|---|---|
| Directory | POST/GET/PATCH `/agencies`, `/owners`, `/legal-subjects`, `/signers` theo các resource routes |
| OwnerSubject | POST `/owners/{ownerId}/subjects` |
| Route | POST `/routes`; POST `/routes/{id}/link-state` |
| Mandate | POST `/mandates/{mandateId}/versions` |
| Scope | POST `/mandate-versions/{versionId}/coverages` |
| Case intake | POST `/cases` |
| Authority selection | POST `/cases/{caseId}/authority-selections` |
| Context | GET `/cases/{caseId}/production-context` |
| Prompt | POST `/cases/{caseId}/prompts` |
| Candidate | POST `/cases/{caseId}/candidates` |
| Technical validation | POST `/candidates/{candidateId}/validation-runs` |
| Review capture | POST `/candidates/{candidateId}/assessments` |
| Readiness | GET `/candidates/{candidateId}/readiness` |
| Final unsigned output | POST `/candidates/{candidateId}/unsigned-exports` |

OpenAPI là nguồn chính xác cho tất cả method/path/required fields; bảng trên chỉ chỉ đường. Chưa có endpoint nào được deploy.

## 7. HTTP và transaction

Strict JSON: unknown fields bị từ chối. PATCH bỏ field nghĩa giữ nguyên; null chỉ xóa field được phép nullable. Client không gửi calculated hashes, user audit timestamps hoặc READY state.

Mutable GET trả ETag. Update/command gửi If-Match. Thiếu precondition:428; version/digest stale:412; xung đột nghiệp vụ:409; dữ liệu sai cấu trúc:422. Không dùng một 409 cho mọi lỗi.

Mutation cần Idempotency-Key. Cùng key/payload retry trả kết quả đã commit; khác payload hoặc resource target bị từ chối. Horizon7 ngày là lựa chọn tác nghiệp, không phải bảo đảm exactly-once vô thời hạn. Write + version increment + audit + idempotency result cùng transaction.

Mọi request cần authorization phù hợp. CSRF/Origin bắt buộc cho unsafe authenticated request. Login không lưu password hoặc session token trong idempotency/audit. Development port mặc định loopback, không mở database ra Internet.

## 8. Đường đi INITIAL và REPLY

INITIAL: chọn dữ liệu directory/route → intake Case → bind nguồn canonical khi có → work/reported/mapping/fact/source → chọn authority → lấy context → generate prompt → ChatGPT soạn ngoài app → import candidate → technical validation + ghi đánh giá substantive có nguồn → kiểm readiness → xuất unsigned.

REPLY thêm exact parent NMI, các prior AS_SENT liên quan, literal reviewer asks và trạng thái attachment thực tế. Không tự chọn “email mới nhất” hoặc sao chép finding của case khác. Correspondence import là ghi nhận thư đã tồn tại, không tạo lần gửi mới.

Nếu chưa đủ thông tin: vẫn preparation draft với MISSING/CONFLICT. Không được gắn final-ready để làm dashboard đẹp.

## 9. Hai PC và bước tiếp theo

Repo/spec/lockfile/migration/synthetic fixtures đồng bộ qua private GitHub. `.env`, secrets, Docker volume và confidential case data không vào Git. Một máy tạo migration; máy kia áp dụng migration đã commit. Không coi cùng Gmail/ChatGPT là đồng bộ local database.

P0 tiếp theo: khởi tạo repo, khóa dependency versions, chạy Prisma validate/generate, tạo migration thật trên MySQL8.4 disposable, kiểm FK/CHECK/transaction và chạy lại Zod adapter. Chỉ sau đó mới Directory CRUD. Chưa deploy Hostinger.

## 10. Kiểm chứng và giới hạn

Đã chạy 46 kiểm tra cấu trúc, 27 test hàm tham chiếu, TypeScript strict cho types không phụ thuộc package; đã transpile syntax Zod. Tất cả các kiểm tra đó PASS.

Chưa chạy Prisma CLI, Zod runtime/typecheck theo dependency thực, MySQL migration, HTTP integration, UI/E2E, 60 application acceptance scenarios, Windows setup hoặc production. SQL trong gói là PREVIEW, không phải migration đã được Prisma sinh/áp dụng.

Không mutation Drive, không sửa real case, không gửi email, không tạo signature/G7. Đây là schema/API design package để triển khai và kiểm nghiệm, không phải chứng nhận phần mềm đã hoạt động hoặc claim đủ điều kiện pháp lý.
