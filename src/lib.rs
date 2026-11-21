use worker::*;

#[event(fetch)]
pub async fn main(
    req: Request,
    _env: Env,
    _ctx: Context,
) -> Result<Response> {
    let url = req.url()?;

    match (req.method(), url.path()) {
        (Method::Get, "/api/health") => {
            Response::from_json(&serde_json::json!({
                "app": "ELCICA POS",
                "status": "online",
                "version": "0.1.0"
            }))
        }

        _ => {
            Response::error("Not Found", 404)
        }
    }
}
