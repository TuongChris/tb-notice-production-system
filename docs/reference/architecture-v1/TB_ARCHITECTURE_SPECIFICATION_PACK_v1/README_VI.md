# Architecture Specification Pack v1 — Hướng dẫn sử dụng

**Release:** TB-ARCH-v1.0.0 · **Ngày:** 23/09/2026.
**Trạng thái:** Đã tạo bộ tài liệu để Claude đọc/đối chiếu; **chưa phải lệnh bắt đầu code và chưa phải ứng dụng chạy được**.

## 1. Gói này giải quyết việc gì?

Bổ sung các đặc tả cấp cao còn thiếu sau báo cáo read-only của Claude Code, đồng thời trả lời từng điểm trong 16 vấn đề đã nêu. Giữ nguyên gói Database/API đã có; không bắt bạn copy lại các đoạn chat dài.

| Tài liệu chính | Nội dung |
|---|---|
| [Product Definition](docs/product/PRODUCT_DEFINITION_v1.md) | Mục tiêu, đầu ra unsigned và phạm vi V1 |
| [Domain Model](docs/domain/DOMAIN_MODEL_v1.md) | Quan hệ dữ liệu, quyền sửa/xóa, lịch sử và tên model/enum đúng baseline |
| [Production Form Contract](docs/contracts/PRODUCTION_FORM_CONTRACT_v1.md) | Prompt/candidate, technical checks, G1–G6 và giới hạn trước chữ ký |
| [Technology Architecture](docs/architecture/TECHNOLOGY_ARCHITECTURE_v1.md) | WSL, Node/Yarn, MySQL, ESM, contracts, môi trường và bảo mật |
| [Repository Blueprint](docs/architecture/REPOSITORY_BLUEPRINT_v1.md) | Đường dẫn, workspaces, scripts, Git/CI và frozen references |
| [P0 Bootstrap Contract](docs/architecture/P0_BOOTSTRAP_CONTRACT_v1.md) | P0 làm gì, không làm gì, test nào cần chạy thật |
| [Architecture Resolutions](docs/architecture/ARCHITECTURE_RESOLUTIONS_v1.md) | Trả lời 16 mục và ghi rõ các điểm cần đối chiếu giữa bản cũ/mới |

Tài liệu viết bằng tiếng Anh để Claude Code sử dụng trực tiếp; hướng dẫn thao tác ở đây bằng tiếng Việt. [Source Register](docs/architecture/SOURCE_REGISTER_v1.md) phân biệt nguồn đã đọc, quyết định thiết kế và việc chưa được kiểm chứng.

## 2. Những điểm quan trọng đã được đối soát

- File PFC tên v1 nhưng **schemaVersion trên wire đã là PFC-YT-EMAIL-v1.1**; không đổi về v1.
- **READY_FOR_SIGNER là trạng thái tính toán**, không phải cột được ghi hoặc nút admin đặt PASS.
- TechnicalResult có TECHNICAL_PASS/REVIEW_REQUIRED/ERROR; không dùng shorthand PASS để thay đánh giá có nguồn.
- Quyết định active Zod-first được ghi rõ là chuyển hướng authoring so với JSON-Schema-first của gói frozen; phải giữ hành vi API qua parity tests.
- Có cảnh báo riêng về `.refine` đếm Unicode code points; không hứa converter tự bảo toàn mọi kiểm tra.
- P0 dùng MySQL8.4 qua Docker, runtime user khác migration user, shadow database khác database dữ liệu.
- Actor giả bị disable dùng cho fixture P0 không phải tài khoản admin đăng nhập; admin bootstrap thuộc P1.
- `P0_LOCAL_IMPLEMENTATION`, `P0_CI` và `P0_SECOND_PC_REPRODUCTION` được báo riêng. Không gán PASS cho test chưa chạy.

## 3. Trong ZIP còn có gì?

- `import-into-repo.sh`: mặc định dry-run; thêm `--apply` mới chép tài liệu.
- `prompts/CLAUDE_REINSPECTION_PROMPT.txt`: prompt đọc lại, lập kế hoạch, không sửa repository.
- `verification/RESOLUTION_MATRIX.json`: từng vấn đề -> quyết định -> kiểm tra còn phải làm.
- `verification/P0_ACCEPTANCE_MATRIX.json`: kế hoạch nghiệm thu, trạng thái ban đầu NOT_RUN/DEFERRED.
- `verification/REFERENCE_BASELINE.json`: định danh/hash của gói Database/API đã đối chiếu.
- `verification/PACK_VERIFICATION.json`: các kiểm tra thực sự đã chạy trên gói tài liệu/importer.
- `manifest.json` và `MANIFEST.sha256`: inventory và checksum. Hash phát hiện thay đổi so với gói này, không phải chữ ký số hay chứng minh nguồn pháp lý.

Không có package.json ứng dụng, lockfile mới, migration đã chạy, Docker container, tài khoản admin, token hoặc dữ kiện hồ sơ thật trong gói này.

## 4. Cách import trong Ubuntu/WSL

Dùng một terminal Ubuntu tại PC nhà. Có thể giữ Claude ở trạng thái chờ; không yêu cầu Claude chạy implementation.

### A. Xác định file tải về và giải nén bên ngoài repository

Ví dụ đường dẫn Windows đã dùng trong cuộc trao đổi là `C:\Users\Admin\Downloads`. Điều chỉnh ZIP_FILE nếu trình duyệt lưu ở nơi khác hoặc thêm hậu tố vào tên file.

```bash
ZIP_FILE="/mnt/c/Users/Admin/Downloads/TB_ARCHITECTURE_SPECIFICATION_PACK_v1.zip"
ls -lh "$ZIP_FILE"
```

Nếu không thấy file thì dừng và tìm đúng đường dẫn, không chạy tiếp. Khi file tồn tại:

```bash
IMPORT_DIR="$(mktemp -d "$HOME/tb-arch-v1.XXXXXX")"
unzip "$ZIP_FILE" -d "$IMPORT_DIR"
PACK_DIR="$IMPORT_DIR/TB_ARCHITECTURE_SPECIFICATION_PACK_v1"
(cd "$PACK_DIR" && sha256sum -c MANIFEST.sha256)
```

Các biến dùng trong cùng terminal. Không mở terminal khác rồi kỳ vọng PACK_DIR vẫn tồn tại. Mọi checksum phải OK trước khi import.

### B. Về repository và kiểm tra branch

```bash
cd ~/projects/tb-notice-production-system
git status --short
git branch --show-current
```

Mong đợi branch `bootstrap/p0-local`. Không reset hoặc discard nếu có thay đổi lạ. Script từ chối import trên main/master hoặc detached HEAD; không tự switch branch.

### C. Dry-run trước, apply sau

```bash
bash "$PACK_DIR/import-into-repo.sh" --dry-run
```

Script kiểm manifest của cả pack mới và reference Database/API cũ, liệt kê file sẽ thêm và từ chối nếu có file khác nội dung hoặc đường dẫn symlink không an toàn. Chưa có file nào được chép ở dry-run.

Nếu không có lỗi:

```bash
bash "$PACK_DIR/import-into-repo.sh" --apply
```

Script chép một bản pack frozen vào `docs/reference/architecture-v1/TB_ARCHITECTURE_SPECIFICATION_PACK_v1/`, rồi đưa 7 specs + Source Register vào các thư mục docs đang dùng.

Nó **không ghi đè README.md root, .nvmrc, Database/API reference hoặc file khác nội dung**; không chạy install, migration, Git commit/push hay lệnh mạng. Chạy lại với file giống hệt sẽ skip, không tạo bản trùng. Nếu hệ thống file gặp lỗi giữa chừng có thể còn một số file mới đã chép; script không xóa dữ liệu cũ và lần chạy lại kiểm tra từng file trước khi tiếp tục.

### D. Review và commit chỉ tài liệu

```bash
git status --short
git diff --stat
```

Lưu ý: git diff chưa hiển thị nội dung untracked; kiểm tra status và file trước khi stage.

```bash
git add docs/product docs/domain docs/contracts docs/architecture docs/reference/architecture-v1
git diff --cached --stat
git diff --cached --check
```

Chỉ tiếp tục nếu staged changes đúng tài liệu dự kiến, không secrets hoặc file ứng dụng không liên quan:

```bash
git commit -m "docs: add architecture specification pack v1"
git push -u origin bootstrap/p0-local
```

Đây là bước bạn tự thực hiện để lưu tài liệu đã yêu cầu; importer không tự commit. Nếu push lỗi, không force-push. Repo chưa có application code là bình thường.

## 5. Prompt gửi Claude

Mở [CLAUDE_REINSPECTION_PROMPT.txt](prompts/CLAUDE_REINSPECTION_PROMPT.txt), copy phần nội dung gửi Claude đang mở ở root repo. Prompt chỉ cho đọc/đối chiếu/lập kế hoạch, không code.

Claude cần phân biệt RESOLVED_BY_SPEC, RUNTIME_CHECK_PENDING và BLOCKER. Phiên bản package/image chưa chọn nhưng có quy trình chọn rõ là việc P0 phải xác minh, không phải lý do bịa giá trị hay lặp lại onboarding không cần thiết.

Mang lại báo cáo đối chiếu và kế hoạch P0 để duyệt trước implementation. Không gửi prompt “continue” chung chung, không bật permission bypass chỉ để bỏ qua các lỗi chưa giải quyết.

## 6. Mức kiểm chứng

PACK_VERIFICATION chỉ kiểm gói tài liệu, import safety và integrity trong môi trường soạn gói. Nó không chứng minh Prisma schema chạy được, MySQL đã migrate, CI đã xanh hoặc cả hai PC đã hoàn thành P0. Những việc đó vẫn nằm trong P0_ACCEPTANCE_MATRIX.
