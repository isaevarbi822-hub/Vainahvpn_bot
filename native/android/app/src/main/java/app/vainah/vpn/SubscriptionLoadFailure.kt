package app.vainah.vpn

import java.net.ConnectException
import java.net.SocketTimeoutException
import java.net.UnknownHostException
import javax.net.ssl.SSLException

/**
 * Public, credential-safe explanations for HTTPS subscription failures.
 * Never display Throwable.message: Java may include a private subscription URL.
 */
class SubscriptionHttpStatus(
    val status: Int,
    val category: SubscriptionDenial.Kind = SubscriptionDenial.Kind.UNKNOWN
) : Exception()

object SubscriptionLoadFailure {
    fun explain(error: Throwable): String = when (error) {
        is SubscriptionHttpStatus -> when (error.status) {
            401 -> "H1Cloud ответил HTTP 401: приложению нужна авторизация. Это не доказательство окончания подписки."
            403 -> "HTTP 403: сервер подписки отклонил запрос Vainah VPN. " +
                "Подписка может работать в другом VPN-клиенте. " +
                SubscriptionDenial.label(error.category) +
                " Это не подтверждает окончание подписки."
            404, 410 -> "HTTP ${error.status}: сервер не нашёл запрошенный адрес подписки. Проверь ссылку в кабинете."
            429 -> "HTTP 429: сервер временно ограничил число запросов. Ранее загруженные серверы сохранены."
            in 300..399 -> "HTTP ${error.status}: сервер перенаправляет подписку. Автоматический переход заблокирован ради защиты ссылки."
            in 500..599 -> "HTTP ${error.status}: сервер H1Cloud временно недоступен."
            else -> "HTTP ${error.status}: сервер не отдал список VPN-серверов."
        }
        is UnknownHostException -> "Ошибка DNS: домен подписки сейчас не определяется."
        is SocketTimeoutException -> "Тайм-аут HTTPS: сервер не ответил. Попробуй обновить позднее."
        is ConnectException -> "Не удалось подключиться к серверу подписки по HTTPS."
        is SSLException -> "Ошибка TLS: не удалось проверить защищённое соединение с H1Cloud."
        is IllegalArgumentException -> "Ссылка или формат подписки не поддерживается этим приложением."
        else -> "Не удалось обновить H1Cloud-серверы. Ранее загруженные локации сохранены."
    }
}
