# Licencia de Datos — Auditoria Legal

## Por que esto es critico

SECOP Intelligence Hub vende analisis IA basado en datos publicos del gobierno colombiano. Si la licencia de esos datos no permite reventa comercial, el modelo de negocio entero se cae.

## Fuentes de datos y sus licencias

### 1. Socrata API (datos.gov.co)

**Licencia**: Creative Commons Attribution 4.0 International (CC BY 4.0)
**Evidencia**: Presente en cada dataset como `"License": "https://creativecommons.org/licenses/by/4.0/"`

**Lo que CC BY 4.0 permite**:
- Compartir, copiar, redistribuir
- Adaptar, transformar, construir sobre los datos
- **Uso comercial** SI

**Lo que CC BY 4.0 exige**:
- Atribucion: dar credito al licenciante
- Indicar cambios realizados
- Sin restricciones tecnologicas adicionales

**Impacto**: POSITIVO. CC BY 4.0 permite uso comercial. Solo necesitamos:
- Poner en la plataforma: "Datos proporcionados por Colombia Compra Eficiente via datos.gov.co (CC BY 4.0)"
- Indicar que los datos pasaron por procesamiento IA

### 2. SECOP II (community.secop.gov.co)

**Licencia**: Datos publicos segun Ley 1712 de 2014 (Transparencia)
**La ley dice**: Toda informacion publica es de libre acceso. No hay restriccion de uso comercial explicita.

**Riesgo**: Bajo. La ley de transparencia existe para facilitar el control ciudadano y el reuso. No hay precedente de restriccion comercial.

### 3. SENA Agencia Publica de Empleo

**Acceso**: Requiere registro y login. No es API publica.
**Riesgo**: No aplica para reventa porque no estamos usando datos SENA para reventa directa.

### 4. Azure Document Intelligence + OpenAI (datos PROCESADOS)

Los resultados del analisis IA son CREACION NUEVA del sistema. No son datos del gobierno. Son un servicio de valor agregado.

## Checklist de Compliance

- [ ] Incluir atribucion CC BY 4.0 en el footer de la plataforma
- [ ] Incluir terminos de uso que eximan de responsabilidad por errores IA
- [ ] NO afirmar que la informacion es oficial (es un analisis asistido)
- [ ] NO almacenar datos de SENA sin consentimiento
- [ ] Incluir disclaimer en cada analisis: "Verificar contra documento original"
- [ ] Registrar la fuente especifica de cada proceso en su detalle

## Accion requerida antes de Facturar

1. Confirmar con abogado que CC BY 4.0 cubre nuestro caso de uso (recomendado pero no bloqueante)
2. Agregar el texto de atribucion en el footer (obligatorio antes de Fase 2)
3. Tener terminos de uso publicos antes de cualquier pago
4. Incluir disclaimer legal en cada analisis generado

## Conclusion

**Riesgo: BAJO — mitigable con atribucion correcta.** 
La licencia CC BY 4.0 esta disenada explicitamente para uso comercial. Colombia Compra Eficiente publica los datos con esta licencia para fomentar su reuso. La Ley 1712 de 2014 refuerza este proposito. No se anticipan problemas legales siempre que:
1. Se de credito a la fuente
2. No se afirme que el analisis es oficial
3. Se incluya un disclaimer

**Firma**: Este documento debe ser revisado por un abogado especializado en datos y tecnologia antes del primer cobro en produccion.
