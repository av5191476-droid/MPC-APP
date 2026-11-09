//! Núcleo MPC del teléfono (partes D y, en emergencias, B). Mismo código que el enclave
//! para garantizar interoperabilidad (T024, T035).
//!
//! Esta capa NO implementa criptografía: expone por FFI (uniffi) un adaptador sobre la
//! biblioteca DKLs23 auditada. Sin la feature `dkls23` todas las operaciones devuelven
//! `BackendNotLinked`, de modo que nunca se puede enviar a producción un build sin ella.

uniffi::setup_scaffolding!();

use std::sync::Mutex;
use zeroize::Zeroizing;

#[derive(Debug, thiserror::Error, uniffi::Error)]
pub enum MpcError {
    #[error("la biblioteca DKLs23 no está enlazada en este build")]
    BackendNotLinked,
    #[error("mensaje de ronda inválido o fuera de orden")]
    BadMessage,
    #[error("la attestation del enclave no es válida: {reason}")]
    BadAttestation { reason: String },
    #[error("las partes son de épocas distintas")]
    EpochMismatch,
    #[error("protocolo abortado")]
    Aborted,
}

/// Lo que devuelve un paso de cualquier protocolo: el mensaje cifrado E2E para el enclave
/// y, al terminar, el resultado.
#[derive(uniffi::Record)]
pub struct Step {
    pub outgoing: Option<Vec<u8>>,
    pub done: bool,
}

#[derive(uniffi::Record)]
pub struct DkgOutput {
    /// secp256k1 comprimida (33 bytes): la dirección del EOA se deriva de aquí.
    pub public_key: Vec<u8>,
    pub share_device: Vec<u8>,
    /// Solo existe en memoria hasta que la app la cifra con K_backup (mpc-protocol §1.3–1.4).
    pub share_backup: Vec<u8>,
    pub epoch: u32,
}

#[derive(uniffi::Record)]
pub struct Signature {
    pub r: Vec<u8>,
    pub s: Vec<u8>,
    pub v: u8,
}

/// Llave de sesión E2E derivada de la attestation verificada del enclave.
#[derive(uniffi::Record)]
pub struct EnclaveSession {
    pub enclave_public_key: Vec<u8>,
    pub pcr0: Vec<u8>,
}

/// Verifica COSE_Sign1 (ES384) y la cadena de certificados hasta la raíz AWS Nitro.
/// La app comprueba además PCR0, nonce y frescura en TypeScript (attestation.ts).
#[uniffi::export]
pub fn verify_attestation_signature(document: Vec<u8>) -> Result<EnclaveSession, MpcError> {
    backend::verify_cose(&document)
}

#[derive(uniffi::Object)]
pub struct DkgParty {
    inner: Mutex<backend::Dkg>,
}

#[uniffi::export]
impl DkgParty {
    /// D emula temporalmente a B durante el DKG (mpc-protocol §1.1).
    #[uniffi::constructor]
    pub fn new(session: EnclaveSession) -> Result<Self, MpcError> {
        Ok(Self { inner: Mutex::new(backend::Dkg::new(session)?) })
    }
    pub fn handle(&self, incoming: Option<Vec<u8>>) -> Result<Step, MpcError> {
        self.inner.lock().map_err(|_| MpcError::Aborted)?.handle(incoming)
    }
    pub fn finish(&self) -> Result<DkgOutput, MpcError> {
        self.inner.lock().map_err(|_| MpcError::Aborted)?.finish()
    }
}

#[derive(uniffi::Object)]
pub struct SignParty {
    inner: Mutex<backend::Sign>,
}

#[uniffi::export]
impl SignParty {
    /// Firma D + S. `share` se copia a memoria que se borra al soltar el objeto.
    #[uniffi::constructor]
    pub fn new(share_device: Vec<u8>, message_hash: Vec<u8>, session: EnclaveSession) -> Result<Self, MpcError> {
        let share = Zeroizing::new(share_device);
        Ok(Self { inner: Mutex::new(backend::Sign::new(share, message_hash, session)?) })
    }
    pub fn handle(&self, incoming: Option<Vec<u8>>) -> Result<Step, MpcError> {
        self.inner.lock().map_err(|_| MpcError::Aborted)?.handle(incoming)
    }
    pub fn signature(&self) -> Result<Signature, MpcError> {
        self.inner.lock().map_err(|_| MpcError::Aborted)?.signature()
    }
}

/// Salida de emergencia (FR-019): D + B en dos contextos aislados, sin servidor.
#[uniffi::export]
pub fn emergency_sign(share_device: Vec<u8>, share_backup: Vec<u8>, message_hash: Vec<u8>) -> Result<Signature, MpcError> {
    let d = Zeroizing::new(share_device);
    let b = Zeroizing::new(share_backup);
    backend::local_sign(&d, &b, &message_hash)
}

#[derive(uniffi::Object)]
pub struct ReshareParty {
    inner: Mutex<backend::Reshare>,
}

#[uniffi::export]
impl ReshareParty {
    /// Recuperación (FR-017): B descifrada en el teléfono nuevo + S → nuevas D', B' (época + 1).
    #[uniffi::constructor]
    pub fn new(share_backup: Vec<u8>, epoch: u32, session: EnclaveSession) -> Result<Self, MpcError> {
        Ok(Self { inner: Mutex::new(backend::Reshare::new(Zeroizing::new(share_backup), epoch, session)?) })
    }
    pub fn handle(&self, incoming: Option<Vec<u8>>) -> Result<Step, MpcError> {
        self.inner.lock().map_err(|_| MpcError::Aborted)?.handle(incoming)
    }
    pub fn finish(&self) -> Result<DkgOutput, MpcError> {
        self.inner.lock().map_err(|_| MpcError::Aborted)?.finish()
    }
}

/// Adaptador. Con la feature `dkls23` este módulo llama a la biblioteca auditada y cifra cada
/// mensaje de ronda con la llave de sesión del enclave. Sin ella, todo falla de forma explícita.
mod backend {
    use super::*;

    #[cfg(feature = "dkls23")]
    compile_error!("Implementa backend::* sobre la biblioteca DKLs23 auditada antes de activar esta feature.");

    pub struct Dkg;
    pub struct Sign;
    pub struct Reshare;

    #[cfg(not(feature = "dkls23"))]
    const NOT_LINKED: MpcError = MpcError::BackendNotLinked;

    pub fn verify_cose(_doc: &[u8]) -> Result<EnclaveSession, MpcError> { Err(NOT_LINKED) }
    pub fn local_sign(_d: &[u8], _b: &[u8], _h: &[u8]) -> Result<Signature, MpcError> { Err(NOT_LINKED) }

    impl Dkg {
        pub fn new(_s: EnclaveSession) -> Result<Self, MpcError> { Err(NOT_LINKED) }
        pub fn handle(&mut self, _m: Option<Vec<u8>>) -> Result<Step, MpcError> { Err(NOT_LINKED) }
        pub fn finish(&mut self) -> Result<DkgOutput, MpcError> { Err(NOT_LINKED) }
    }
    impl Sign {
        pub fn new(_d: Zeroizing<Vec<u8>>, _h: Vec<u8>, _s: EnclaveSession) -> Result<Self, MpcError> { Err(NOT_LINKED) }
        pub fn handle(&mut self, _m: Option<Vec<u8>>) -> Result<Step, MpcError> { Err(NOT_LINKED) }
        pub fn signature(&mut self) -> Result<Signature, MpcError> { Err(NOT_LINKED) }
    }
    impl Reshare {
        pub fn new(_b: Zeroizing<Vec<u8>>, _e: u32, _s: EnclaveSession) -> Result<Self, MpcError> { Err(NOT_LINKED) }
        pub fn handle(&mut self, _m: Option<Vec<u8>>) -> Result<Step, MpcError> { Err(NOT_LINKED) }
        pub fn finish(&mut self) -> Result<DkgOutput, MpcError> { Err(NOT_LINKED) }
    }
}
