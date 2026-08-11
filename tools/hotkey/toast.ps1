param([string]$TitleB64, [string]$BodyB64)
$ErrorActionPreference = 'Stop'
$t = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($TitleB64))
$m = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($BodyB64))

[void][Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime]
$xml = [Windows.UI.Notifications.ToastNotificationManager]::GetTemplateContent(
  [Windows.UI.Notifications.ToastTemplateType]::ToastText02)
$nodes = $xml.GetElementsByTagName('text')
[void]$nodes.Item(0).AppendChild($xml.CreateTextNode($t))
[void]$nodes.Item(1).AppendChild($xml.CreateTextNode($m))
$toast = [Windows.UI.Notifications.ToastNotification]::new($xml)
[Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier('Microsoft.Windows.Explorer').Show($toast)
