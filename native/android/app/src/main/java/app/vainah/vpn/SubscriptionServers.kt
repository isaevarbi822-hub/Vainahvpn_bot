package app.vainah.vpn

import android.util.Base64
import java.net.HttpURLConnection
import java.net.URL

/** Fetches subscription over HTTPS. Never logs bearer URLs or node credentials. */
object SubscriptionServers {
    fun load(raw: String): List<String> {
        val link=SubscriptionLink.validate(raw) ?: throw IllegalArgumentException("Неверная HTTPS-подписка")
        val connection=(URL(link).openConnection() as HttpURLConnection)
        connection.connectTimeout=8000
        connection.readTimeout=8000
        connection.instanceFollowRedirects=false
        connection.setRequestProperty("Accept","text/plain")
        try {
            if(connection.responseCode!=200)throw IllegalStateException("Сервер подписки не ответил успешно")
            val bytes=connection.inputStream.use { input ->
                val output=java.io.ByteArrayOutputStream()
                val buffer=ByteArray(4096)
                while(true){
                    val n=input.read(buffer)
                    if(n<0)break
                    if(output.size()+n>262144)throw IllegalStateException("Подписка слишком большая")
                    output.write(buffer,0,n)
                }
                output.toByteArray()
            }
            val source=bytes.toString(Charsets.UTF_8).trim()
            val decoded=if(source.startsWith("vless://")) source else runCatching {
                String(Base64.decode(source.filterNot { it.isWhitespace() },Base64.DEFAULT),Charsets.UTF_8)
            }.getOrDefault(source)
            val lines=decoded.lines().map { it.trim() }.filter { it.isNotEmpty() }
            if(lines.size>50)throw IllegalStateException("Слишком много серверов")
            val supported=lines.filter { line ->
                if(!line.startsWith("vless://"))false else runCatching {
                    val uri=java.net.URI(line)
                    val params=uri.rawQuery.orEmpty()
                    params.contains("security=reality") && (params.contains("type=tcp") || params.contains("type=raw"))
                }.getOrDefault(false)
            }
            if(supported.isEmpty())throw IllegalStateException("Нет поддерживаемых VLESS REALITY серверов")
            return supported.indices.map { "Сервер ${it+1} · VLESS REALITY" }
        }finally{ connection.disconnect() }
    }
}
