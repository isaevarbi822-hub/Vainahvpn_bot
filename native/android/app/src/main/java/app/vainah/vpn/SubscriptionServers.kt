package app.vainah.vpn

import android.util.Base64
import java.net.HttpURLConnection
import java.net.URL
import java.net.URLDecoder
import java.util.Locale

/** Fetches subscription over HTTPS. Never logs bearer URLs or node credentials. */
object SubscriptionServers {
    /** Only readable labels, never expose UUID, hostname, private key or query tokens. */
    fun displayName(raw: String, index: Int): String {
        val fragment = raw.substringAfter('#', "").take(160)
        val decoded = runCatching { URLDecoder.decode(fragment.replace("+", "%2B"), "UTF-8") }
            .getOrDefault(fragment).trim()
        val clean = decoded.replace(Regex("[\\p{Cntrl}]"), "").take(60)
        if (clean.isBlank()) return "Локация $index"
        val lower = clean.lowercase(Locale.ROOT)
        val country = when {
            Regex("(^|[^a-z])(germany|deutschland|de)([^a-z]|$)").containsMatchIn(lower) ||
                "герман" in lower || "🇩🇪" in clean -> "🇩🇪 Германия"
            Regex("(^|[^a-z])(spain|espana|españa|es)([^a-z]|$)").containsMatchIn(lower) ||
                "испан" in lower || "🇪🇸" in clean -> "🇪🇸 Испания"
            else -> null
        }
        return country ?: clean
    }

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
            val decoded=if(source.startsWith("vless://") || source.contains("\\nvless://")) source else runCatching {
                String(Base64.decode(source.filterNot { it.isWhitespace() },Base64.DEFAULT),Charsets.UTF_8)
            }.getOrDefault(source)
            val lines=decoded.lines().map { it.trim() }.filter { it.isNotEmpty() }
            if(lines.size>50)throw IllegalStateException("Слишком много серверов")
            val supported=lines.filter { line ->
                if(!line.startsWith("vless://"))false else runCatching {
                    val uri=java.net.URI(line)
                    val params=uri.rawQuery.orEmpty().split('&').mapNotNull {
                        val parts=it.split('=',limit=2)
                        if(parts.size==2) parts[0] to parts[1] else null
                    }.toMap()
                    val id=uri.rawUserInfo.orEmpty()
                    uri.scheme=="vless" && uri.host!=null && uri.port in 1..65535 &&
                    runCatching { java.util.UUID.fromString(id) }.isSuccess &&
                    params["security"]=="reality" &&
                    (params["type"]==null || params["type"]=="tcp" || params["type"]=="raw") &&
                    !params["pbk"].isNullOrBlank() && !params["sni"].isNullOrBlank()
                }.getOrDefault(false)
            }
            if(supported.isEmpty())throw IllegalStateException("Нет поддерживаемых VLESS REALITY серверов")
            return supported.mapIndexed { index, uri -> displayName(uri, index + 1) }
        }finally{ connection.disconnect() }
    }
}
