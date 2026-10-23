import Foundation
import Security
import SwiftUI

/// A real native challenge and the token returned after Twilio approves an OTP.
/// Neither the code nor user-entered contacts are written to local persistence.
@MainActor
final class NativeAccount: ObservableObject {
    @Published private(set) var authenticated = false
    @Published private(set) var emailVerified = false
    @Published private(set) var provider = ""
    @Published private(set) var challengePending = false
    @Published private(set) var busy = false
    @Published private(set) var externalPending = false

    private struct Challenge {
        let token: String
        let method: String
        let contact: String
        let previous: String?
    }
    private var pending: Challenge?
    private struct ExternalFlow {
        let flowId: String
        let pollSecret: String
    }
    private var externalFlow: ExternalFlow?
    private let origin = URL(string: "https://vainahvpnbot0.netlify.app")!
    private let keychainService = "app.vainah.vpn.mobile-auth"
    private let keychainAccount = "verified-mobile-session"

    init() {
        authenticated = loadToken() != nil
    }
    private func loadToken() -> String? {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: keychainService,
            kSecAttrAccount as String: keychainAccount,
            kSecReturnData as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne
        ]
        var result: CFTypeRef?
        guard SecItemCopyMatching(query as CFDictionary, &result) == errSecSuccess,
              let bytes = result as? Data else { return nil }
        return String(data: bytes, encoding: .utf8)
    }
    private func persist(_ token: String) throws {
        guard token.count >= 80 && token.count <= 2100 else { throw LoginError.invalid }
        let base: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: keychainService,
            kSecAttrAccount as String: keychainAccount
        ]
        SecItemDelete(base as CFDictionary)
        var record = base
        record[kSecValueData as String] = Data(token.utf8)
        record[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
        guard SecItemAdd(record as CFDictionary, nil) == errSecSuccess else {
            throw LoginError.storage
        }
        authenticated = true
    }
    func signOut() {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: keychainService,
            kSecAttrAccount as String: keychainAccount
        ]
        SecItemDelete(query as CFDictionary)
        authenticated = false
        emailVerified = false
        provider = ""
        pending = nil
        challengePending = false
        externalPending = false
        externalFlow = nil
    }
    enum LoginError: LocalizedError {
        case invalid, storage, unavailable
        var errorDescription: String? {
            switch self {
            case .invalid: return "Проверь адрес, номер телефона или код."
            case .storage: return "Не удалось сохранить вход в Keychain."
            case .unavailable: return "Сервер подтверждения временно недоступен."
            }
        }
    }
    private func exchange(_ endpoint: String, payload: [String: String]? = nil,
                          bearer: String? = nil) async throws -> [String: Any] {
        guard let url = URL(string: "/.netlify/functions/" + endpoint, relativeTo: origin)
        else { throw LoginError.invalid }
        var request = URLRequest(url: url.absoluteURL)
        request.cachePolicy = .reloadIgnoringLocalAndRemoteCacheData
        request.timeoutInterval = 14
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        if let bearer { request.setValue("Bearer " + bearer, forHTTPHeaderField: "Authorization") }
        if let payload {
            request.httpMethod = "POST"
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.httpBody = try JSONSerialization.data(withJSONObject: payload)
        }
        let (data, reply) = try await URLSession.shared.data(for: request)
        guard let http = reply as? HTTPURLResponse,
              (200...299).contains(http.statusCode),
              data.count <= 20_000,
              let json = try JSONSerialization.jsonObject(with: data) as? [String: Any]
        else { throw LoginError.unavailable }
        return json
    }
    func send(method: String, contact: String, attachEmail: Bool = false) async throws {
        guard !busy else { return }
        busy = true; defer { busy = false }
        let previous = attachEmail ? loadToken() : nil
        if attachEmail && previous == nil { throw LoginError.invalid }
        let effective = attachEmail ? "email" : method
        guard ["phone","email"].contains(effective) else { throw LoginError.invalid }
        let response = try await exchange("mobile-auth",payload: [
            "action": attachEmail ? "email-send" : "send",
            "method": effective, "contact": contact.trimmingCharacters(in: .whitespacesAndNewlines)
        ],bearer: previous)
        guard response["sent"] as? Bool == true,
              let token = response["challenge"] as? String else { throw LoginError.unavailable }
        pending = Challenge(token: token,method: effective,
                            contact: contact.trimmingCharacters(in: .whitespacesAndNewlines),
                            previous: previous)
        challengePending = true
    }
    func confirm(code: String) async throws {
        guard !busy else { return }
        guard let pending else { throw LoginError.invalid }
        busy = true; defer { busy = false }
        let response = try await exchange("mobile-auth",payload: [
            "action": pending.previous == nil ? "check" : "email-check",
            "method": pending.method,"contact":pending.contact,
            "challenge":pending.token,"code":code
        ],bearer: pending.previous)
        guard response["authenticated"] as? Bool == true,
              let token = response["token"] as? String else { throw LoginError.invalid }
        try persist(token)
        emailVerified = response["emailVerified"] as? Bool == true
        provider = response["provider"] as? String ?? ""
        self.pending = nil
        challengePending = false
    }
    func beginExternal(_ method: String) async throws -> URL {
        guard ["telegram","yandex"].contains(method) else { throw LoginError.invalid }
        guard !busy else { throw LoginError.unavailable }
        busy = true
        defer { busy = false }
        let data = try await exchange("mobile-link",payload: [
            "action": "start","provider": method
        ])
        guard let flow = data["flowId"] as? String,
              let poll = data["pollSecret"] as? String,
              poll.range(of: "^[a-f0-9]{64}$",options:.regularExpression) != nil,
              let string = data["browserUrl"] as? String,
              let url = URL(string:string),
              url.scheme == "https",url.host == origin.host,
              url.path == "/mobile-link.html",url.user == nil,
              url.password == nil,url.fragment == nil else { throw LoginError.invalid }
        externalFlow = ExternalFlow(flowId: flow,pollSecret: poll)
        externalPending = true
        return url
    }
    func finishExternal() async throws -> Bool {
        guard !busy else { throw LoginError.unavailable }
        guard let flow=externalFlow else { throw LoginError.invalid }
        busy = true
        defer { busy = false }
        let data = try await exchange("mobile-link",payload: [
            "action": "poll","flowId":flow.flowId,"pollSecret":flow.pollSecret
        ])
        if data["pending"] as? Bool == true { return false }
        guard data["authenticated"] as? Bool == true,
              let token=data["token"] as? String else { throw LoginError.invalid }
        try persist(token)
        emailVerified = data["emailVerified"] as? Bool == true
        provider = data["provider"] as? String ?? ""
        externalFlow = nil
        externalPending = false
        return true
    }

    func refresh() async {
        guard let token = loadToken() else { authenticated = false; return }
        do {
            let reply = try await exchange("mobile-auth",bearer: token)
            authenticated = reply["authenticated"] as? Bool == true
            emailVerified = reply["emailVerified"] as? Bool == true
            provider = reply["provider"] as? String ?? ""
            if !authenticated { signOut() }
        } catch { /* Do not sign out on a transient network outage. */ }
    }
}
