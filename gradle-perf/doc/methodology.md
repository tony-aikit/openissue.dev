# Giao thức đo

Maven perf thường so bốn thứ: khởi động JVM (`mvn` so với `mvnd`), reactor song song (`-T`), cache sản phẩm build, và lần build thứ hai khi source không đổi. Gradle đã có sẵn daemon, `--parallel`, build cache và incremental compile. Configuration cache là lớp Gradle không có bản Maven tương đương ổn định. Bộ đo này cô lập từng lớp đó trên cùng một checkout.

## Vì sao không chạy full test

PR Builder của ServiceTalk mất khoảng 19 phút cho job JDK 17, và `check` trên snapshot mất khoảng 34 phút. Worker test trong `ServiceTalkLibraryPlugin` đặt `-Xms2g -Xmx4g`. Máy đo có 4 CPU và khoảng 5GB RAM trống, nên một suite test sẽ vừa sai điều kiện vừa làm hỏng số đo. Lát compile vẫn đi qua cấu hình của toàn bộ build vì Gradle phải dựng graph trước khi chạy ba project được chỉ định.

Ba project:

- `servicetalk-buffer-api`
- `servicetalk-concurrent-api`
- `servicetalk-http-api`

`http-api` phụ thuộc các module hạ tầng, nên `assemble` biên dịch nhiều hơn ba project.

## Cách đọc một kịch bản

Mỗi lần chạy ghi wall clock của process `./gradlew` và thời gian Gradle in ở dòng `BUILD SUCCESSFUL`. Median chỉ tính các lần `measured`. Lần `warmup` làm nóng daemon hoặc ghi cache, rồi bị loại khỏi median.

`compile-cache-store` thực thi task và ghi cache. `compile-cache-hit` là lần `clean + assemble` tiếp theo. `clean` chỉ xóa `build/` của ba project được chỉ định, không xóa project phụ thuộc đã biên dịch. Cache nằm ở `GRADLE_USER_HOME`, đúng chỗ một remote cache hoặc `gradle/actions/setup-gradle` sẽ phục hồi trên CI.

Kịch bản configuration cache truyền `--no-configure-on-demand` để phải cấu hình toàn bộ build, cùng điều kiện với kịch bản daemon tuần tự. `help` không biên dịch source. Nó đo chi phí dựng task graph.

`compile-ci-shape` lặp lại hình dạng workflow hiện tại: `--no-daemon --parallel --build-cache`, sau khi cache đã được ghi. Nó cho biết phần thời gian còn lại là khởi động JVM chứ không phải compile lại.

Heap daemon bị ghi đè thành `-Xmx2g` vì `gradle.properties` của repo xin 4GB và user-home properties có thứ tự cao hơn project properties. Số đo vì thế không phải profile heap của CI. So sánh giữa các kịch bản vẫn cùng một heap.

## Việc cố ý không đo

- JaCoCo, Checkstyle, PMD, SpotBugs. Chúng thuộc job quality, không thuộc lát này.
- `publish --no-parallel`. Thời gian đó chủ yếu là ký và upload.
- Đổi wrapper từ `-all` sang `-bin`. Distribution đã nằm trong `GRADLE_USER_HOME` trước các lần đo, nên kích thước zip không còn trong số liệu.
- Arcade Java. Repo đó đã bật configuration cache. Trang này chỉ đo ServiceTalk.
