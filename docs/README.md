# Documentazione di KinetiX

Per la descrizione del progetto e la guida ai contributori (in inglese) vedi [README.md](../README.md) e [DEVELOPMENT-GUIDE.md](../DEVELOPMENT-GUIDE.md).

I documenti di riferimento:

- [Documento funzionale](documento-funzionale.md): scopo, attori, perimetro, requisiti, esempi.
- [Architettura](architettura.md): componenti, sicurezza, decisioni architetturali (ADR-11: NG-ZORRO come libreria UI target).
- [Linee guida di implementazione](linee-guida.md): stack, struttura, convenzioni, test, rilascio.
- [Testi dinamici e traduzioni](testi-e-traduzioni.md): opzioni considerate per testi dinamici e i18n, scelta fatta (funzioni di presentazione e catalogo di applicazione) e scostamenti.
- [Catalogo dei componenti](catalogo-componenti.md): componenti realizzati e in costruzione, con la specifica di ciascuno.
- [Riferimento dello schema](riferimento-schema.md): tutte le proprietà di componenti, passi, campi e data source, generate da `screen.schema.json` (`npm run schema:docs`).
- [KinetiX Studio](editor.md): com'è fatto l'editor visuale delle schermate, come genera il pannello delle proprietà dallo schema, l'anteprima, le scorciatoie, i limiti.

Le decisioni architetturali (ADR) vanno copiate in questa cartella, una per file, quando passano da "Proposta" ad "Accettata".
