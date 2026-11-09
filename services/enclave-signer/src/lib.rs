//! Nodo S del MPC 2-de-3. Corre dentro de un Nitro Enclave; su parte solo existe
//! descifrada aquí (KMS con política PCR0, FR-005).
//!
//! Este crate NO implementa criptografía: envuelve la biblioteca DKLs23 auditada detrás de
//! `ThresholdEcdsa` (Constitución II) y añade la puerta que decide si S participa.

use zeroize::{Zeroize, ZeroizeOnDrop};

/// Parte S descifrada. Se borra de memoria al salir de alcance (CHK004).
#[derive(Zeroize, ZeroizeOnDrop)]
pub struct ServerShare {
    bytes: Vec<u8>,
    pub epoch: u32,
}

impl ServerShare {
    pub fn from_unwrapped(bytes: Vec<u8>, epoch: u32) -> Self { Self { bytes, epoch } }
    pub fn expose(&self) -> &[u8] { &self.bytes }
}

/// Adaptador sobre DKLs23 auditado. Ninguna función devuelve la llave completa.
pub trait ThresholdEcdsa {
    type Session;
    fn sign_start(&self, share: &ServerShare, message_hash: [u8; 32]) -> Result<(Self::Session, Vec<u8>), GateError>;
    fn sign_round(&self, session: &mut Self::Session, incoming: &[u8]) -> Result<Option<Vec<u8>>, GateError>;
}

/// Verificación P-256 de la aserción WebAuthn del usuario sobre `message_hash`, hecha
/// DENTRO del enclave: así un backend comprometido no puede pedir a S que co-firme un hash
/// que el usuario no aprobó (refuerza T4).
pub trait AssertionVerifier {
    fn verify(&self, credential_pubkey: &[u8; 64], message_hash: &[u8; 32], assertion: &[u8]) -> bool;
}

#[derive(Debug, thiserror::Error, PartialEq)]
pub enum GateError {
    #[error("la parte es de otra época")]
    EpochMismatch,
    #[error("aserción de passkey inválida para este hash")]
    BadAssertion,
    #[error("falta la aprobación del coordinador (segundo factor/antifraude)")]
    NotApproved,
    #[error("error del protocolo MPC")]
    Protocol,
}

pub struct SignRequest<'a> {
    pub message_hash: [u8; 32],
    pub expected_epoch: u32,
    pub credential_pubkey: &'a [u8; 64],
    pub passkey_assertion: &'a [u8],
    /// Decisión de `evaluateCosign` en la API, firmada por el coordinador.
    pub coordinator_approved: bool,
}

/// Puerta de mpc-protocol §2: S solo participa si todo cuadra.
pub fn gate(req: &SignRequest<'_>, share: &ServerShare, v: &impl AssertionVerifier) -> Result<(), GateError> {
    if share.epoch != req.expected_epoch {
        return Err(GateError::EpochMismatch);
    }
    if !v.verify(req.credential_pubkey, &req.message_hash, req.passkey_assertion) {
        return Err(GateError::BadAssertion);
    }
    if !req.coordinator_approved {
        return Err(GateError::NotApproved);
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    struct Always(bool);
    impl AssertionVerifier for Always {
        fn verify(&self, _: &[u8; 64], _: &[u8; 32], _: &[u8]) -> bool { self.0 }
    }
    fn req(epoch: u32, ok: bool) -> SignRequest<'static> {
        static PK: [u8; 64] = [1; 64];
        SignRequest { message_hash: [9; 32], expected_epoch: epoch, credential_pubkey: &PK, passkey_assertion: b"a", coordinator_approved: ok }
    }

    #[test]
    fn rechaza_epoch_vieja() {
        let s = ServerShare::from_unwrapped(vec![1, 2, 3], 3);
        assert_eq!(gate(&req(2, true), &s, &Always(true)), Err(GateError::EpochMismatch));
    }
    #[test]
    fn rechaza_asercion_invalida() {
        let s = ServerShare::from_unwrapped(vec![1], 0);
        assert_eq!(gate(&req(0, true), &s, &Always(false)), Err(GateError::BadAssertion));
    }
    #[test]
    fn rechaza_sin_aprobacion() {
        let s = ServerShare::from_unwrapped(vec![1], 0);
        assert_eq!(gate(&req(0, false), &s, &Always(true)), Err(GateError::NotApproved));
    }
    #[test]
    fn acepta_si_todo_cuadra() {
        let s = ServerShare::from_unwrapped(vec![1], 0);
        assert!(gate(&req(0, true), &s, &Always(true)).is_ok());
    }
}
