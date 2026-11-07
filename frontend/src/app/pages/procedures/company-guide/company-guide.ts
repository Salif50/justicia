import { Component, OnInit, inject, input, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { CompanyGuide, LibraryService, frDate } from '../../../services/library.service';

/**
 * « Créer une entreprise en Guinée » : coûts, délai, étapes et organismes du guichet
 * unique APIP / GDB, repris tels quels de la source (fiches 2026), avec le lien vers
 * les Actes uniformes OHADA applicables dans la bibliothèque.
 */
@Component({
  selector: 'app-company-guide',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './company-guide.html',
  styleUrl: './company-guide.scss',
})
export class CompanyGuideCard implements OnInit {
  private lib = inject(LibraryService);
  private router = inject(Router);

  /** Page dédiée : guide déplié d'emblée ; sur la page des démarches : résumé + lien. */
  full = input(false);
  guide = signal<CompanyGuide | null>(null);
  open = signal(false);
  faqOpen = signal<number | null>(null);
  readonly frDate = frDate;

  ngOnInit(): void {
    this.open.set(this.full());
    this.lib.companyGuide().subscribe({ next: g => this.guide.set(g), error: () => this.guide.set(null) });
  }

  ask(forme?: string): void {
    const q = forme
      ? `Je veux créer une ${forme} en Guinée : quelles sont les règles de l’AUSCGIE (capital, associés, dirigeants, statuts) et les démarches au guichet unique ?`
      : 'Quelle forme juridique choisir pour créer mon entreprise en Guinée, et quelles sont les démarches au guichet unique APIP ?';
    this.router.navigate(['/dashboard/chat'], { queryParams: { q } });
  }

  /** Première phrase d'une réponse de FAQ, pour la question affichée. */
  faqTitle(text: string): string {
    const known: [RegExp, string][] = [
      [/^La création d'une entreprise en Guinée se fait/, 'Où et comment créer son entreprise ?'],
      [/le montant payé au guichet unique est de/, 'Combien coûte la création ?'],
      [/annonce un délai de 72 heures/, 'Quel est le délai ?'],
      [/le guichet unique demande \(fiches 2026\)/, 'Quelles pièces fournir ?'],
      [/^La SARL compte un ou plusieurs associés/, 'SARL ou SA : quelles différences ?'],
      [/^Le capital d'une SARL est librement fixé/, 'Quel capital pour une SARL ?'],
      [/^Oui\. Vous pouvez désigner un mandataire/, 'Peut-on créer depuis l’étranger ?'],
      [/membre de l'Organisation pour l'Harmonisation/, 'Quel droit s’applique (OHADA) ?'],
      [/^L'APIP \(Agence de Promotion/, 'Quel est le rôle de l’APIP ?'],
      [/^Le NIF \(Numéro d'Identification Fiscale\)/, 'Comment obtenir le NIF ?'],
      [/^Le RCCM \(Registre du Commerce/, 'Qu’est-ce que le RCCM ?'],
      [/immatriculer à la Caisse Nationale de Sécurité Sociale/, 'Faut-il s’inscrire à la CNSS ?'],
      [/^Le choix dépend du nombre d'associés/, 'Quelle forme choisir ?'],
    ];
    for (const [re, label] of known) if (re.test(text)) return label;
    return text.split(/(?<=[.?!])\s/)[0].slice(0, 90);
  }
}
