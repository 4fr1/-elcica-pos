use worker::*;

/// Sumber kebenaran identitas ada di auth Worker. PWA hanya meneruskan cookie.
const AUTH_ME_URL: &str = "https://auth.elcica.xyz/api/me";

#[event(fetch)]
pub async fn main(req: Request, _env: Env, _ctx: Context) -> Result<Response> {
    let url = req.url()?;

    match (req.method(), url.path()) {
        (Method::Get, "/api/health") => Response::from_json(&serde_json::json!({
            "app": "ELCICA POS",
            "status": "online",
            "version": "0.1.0"
        })),

        (Method::Get, "/api/me") => {
            let cookie = req.headers().get("Cookie")?.unwrap_or_default();

            if !cookie.contains("elcica_session=") {
                return Response::from_json(&serde_json::json!({
                    "error": "belum login"
                }))
                .map(|res| res.with_status(401));
            }

            let mut upstream = Request::new(AUTH_ME_URL, Method::Get)?;
            upstream.headers_mut()?.set("Cookie", &cookie)?;

            let mut auth_res = Fetch::Request(upstream).send().await?;
            let status = auth_res.status_code();
            let body = auth_res.text().await?;

            let mut res = Response::from_bytes(body.into_bytes())?;
            res.headers_mut()
                .set("Content-Type", "application/json; charset=utf-8")?;
            res.headers_mut().set("Cache-Control", "no-store")?;

            Ok(res.with_status(status))
        }

        _ => Response::error("Not Found", 404),
    }
}
