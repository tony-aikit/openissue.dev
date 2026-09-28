# Gradle perf cho ServiceTalk

Bộ đo này áp thứ tự thí nghiệm của mvn-perf sang Gradle: JVM mới so với daemon, build lại so với incremental, không cache so với build cache, và một lần thử configuration cache. Đối tượng là [apple/servicetalk](https://github.com/apple/servicetalk).

Trang kết quả nằm ở `site/`. Workflow `.github/workflows/gradle-perf-pages.yml` phát hành thư mục đó lên GitHub Pages khi `main` nhận các file này.

## Đo lại

Cần JDK 17+ và một checkout ServiceTalk. Script không chạy `test`.

```bash
git clone --depth 1 https://github.com/apple/servicetalk.git /tmp/servicetalk
node gradle-perf/src/measure/run-scenarios.mjs --servicetalk /tmp/servicetalk
node gradle-perf/src/report/publish-site.mjs
node --test gradle-perf/src/report/parse-gradle-log.test.mjs
```

`GRADLE_USER_HOME` mặc định là `/tmp/gradle-perf-home`. File `gradle.properties` trong home đó chỉ hạ heap daemon xuống 2GB và tắt file-system watching. Các cờ parallel, cache và daemon được truyền tường minh trên từng kịch bản.

Chi tiết giao thức nằm trong [doc/methodology.md](doc/methodology.md).
