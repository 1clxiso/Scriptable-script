# Codex 用量与订阅

基于 [MananaFX/Scritable-Codex-Usage](https://github.com/MananaFX/Scritable-Codex-Usage) 的用量处理和深色界面扩展，参考提交为 `3eaf44939e7a4bf40ce9cd6bae4112a1c993d240`。

本地脚本：`Codex用量与订阅.js`。需要你已有的 HTTPS 用量接口；脚本不会直接登录 ChatGPT，也不会自动采集账单。

## 配置与使用

1. 将脚本导入 iOS Scriptable，在 App 内运行。
2. 选择“配置接口与订阅日期”，填写完整 HTTPS `/usage` 接口地址。自定义接口路径和查询参数会保留，只有纯域名会补上 `/usage`。
3. 若接口需要 Bearer Token，可在安全输入框中填写；配置和 Token 保存到本机 Keychain，不写入脚本。Token 留空保留原值，填 `-` 清除；换接口地址时，未重新填写的旧 Token 会清除。
4. 如果接口没有订阅字段，可填 Codex / Claude 的手动到期日期，格式为 `YYYY-MM-DD`；留空表示未设置。该日期按设备本地时区当天结束计算，并标注“手动”。
5. 添加桌面 Scriptable 组件，选择该脚本。默认中号显示 Codex 用量及订阅日期；参数 `claude` 显示 Claude，`both` 显示双服务，`week` 显示 Codex 及周图表。小号显示所选的单个服务。

接口仍使用原项目的 `services.codex` / `services.claude` 和 `five_hour` / `weekly` 等字段。原来的单服务响应也兼容。

支持参数覆盖地址，例如 `both https://你的域名/usage`。覆盖到不同接口时，不发送原接口的 Token，也不套用原账号的手动日期；如新接口需要认证，请在 App 设置中保存新地址和 Token。

默认请求刷新间隔为 10 分钟，实际组件刷新由 iOS 决定。网络失败会尝试本地缓存，并标注“缓存”；不会将本次组件运行时间当作数据更新时间。

## 自动订阅日期

不知道如何查看接口 JSON 时，先在 App 内配置接口，再运行脚本选择“检查接口字段”。该功能实时请求接口并给出中文结论，只列出已知订阅字段名和格式状态，不展示 Token、邮箱或字段具体值。可以点击“复制检查结果”再发送检查文字；无需复制原始响应。

原项目的公开接口定义没有订阅到期字段。自动显示需要你的后端在对应服务对象里增加明确的 `subscription` 信息，例如：

```json
{
  "services": {
    "codex": {
      "subscription": {
        "expires_at": "2026-12-01T16:00:00Z"
      }
    }
  }
}
```

以上是新增字段的局部示例，应合并到你现有的有效用量响应里。完整的示例数据见 `examples/codex-subscription-usage.example.json`，其中日期与用量均为演示值。

| 字段 | 显示含义 |
| --- | --- |
| `subscription.expires_at` | 明确的订阅到期时间，优先使用 |
| `subscription.renews_at` | 下次续费时间，显示“下次续费” |
| `subscription.current_period_end` + `cancel_at_period_end: true` | 已确认到期取消，显示“订阅到期” |
| `subscription.current_period_end` + `cancel_at_period_end: false` | 继续订阅的当前周期结束时间，显示“下次续费” |
| 只有 `subscription.current_period_end` | 状态不明，显示“周期结束” |

接口时间支持带时区的 ISO 8601 时间、Unix 秒或 Unix 毫秒；不接受含义不明的无时区时间或日期字符串。API 时间按设备本地时区显示。

如果没有有效的接口订阅时间，则使用当前接口的手动日期；都没有时显示“未提供”。剩余天数按距离该时间的实际时长向上取整；日期已过时提示核对，不将其作为账号已失效的判断。

**用量窗口的 `resets_at`、JWT 的 `exp` 和登录 Token 的过期时间都不会被当作订阅到期时间。** 是否能自动取得真实到期日，取决于你的采集后端及其订阅数据源；仅增加前端无法产生后端没有提供的信息。

## 验证范围

日期解析、订阅字段优先级、无字段回退、缓存隔离和各尺寸的组件构建可在本地使用模拟 Scriptable 环境验证。真实接口连接和 iOS 的最终排版仍需在设备上确认。
