export interface ViolationContext {
    title: string;
    law: string;
    education: string;
}

export const getViolationContext = (status: string, balance: number, type?: string): ViolationContext => {
    // 1. Charge-Off with Balance (Double Dipping)
    if (status === 'CHARGE_OFF' && balance > 0) {
        return {
            title: "Balance Reporting Error",
            law: "FCRA § 623(a)(2)",
            education: "This account is marked as a 'Charge Off', meaning the lender has written it off as a tax loss. However, they are still reporting a balance owed. This is considered 'Double Dipping' and is a violation of accuracy standards. If they have taken the tax benefit, they cannot continue to report the debt as an asset on your report."
        };
    }

    // 2. Collections (Chain of Title)
    if (status === 'COLLECTION') {
        return {
            title: "Debt Ownership Validation",
            law: "FDCPA § 807 / FCRA § 611",
            education: "Third-party collectors often buy debts in bulk without proper documentation. Under the law, they must prove they legally own this specific debt via a clear 'Chain of Title' from the original creditor. If they cannot produce the original signed contract and assignment documents, they cannot legally report this negative item."
        };
    }

    // 3. Late Payments (Reporting Accuracy)
    if (status === 'LATE') {
        return {
            title: "Payment History Accuracy",
            law: "FCRA § 605(a)(5)",
            education: "Late payments can only be reported if they are verifiable and accurate. If the dates of delinquency do not match across all three bureaus (Metro 2 Compliance), the item fails the 'Maximum Possible Accuracy' standard and can be challenged. Often, creditors fail to keep records of the exact 30-day window."
        };
    }

    // 4. Repossession (Deficiency Balance)
    if (status === 'REPO') {
        return {
            title: "Deficiency Balance Protocol",
            law: "UCC Article 9",
            education: "After a repossession, the lender must sell the asset in a 'commercially reasonable manner' and notify you of the sale details before billing you for the difference (deficiency). If they failed to send proper notices or sold the vehicle for far below market value, they may be barred from collecting or reporting a balance."
        };
    }

    // Default Catch-All
    return {
        title: "Data Integrity Failure",
        law: "FCRA § 607(b)",
        education: "The FCRA requires credit bureaus to follow reasonable procedures to ensure 'maximum possible accuracy'. Any inconsistency in dates, balances, or account status creates a valid basis for a dispute. If the bureau cannot verify the accuracy within 30 days, simply validating the debt is not enough; they must prove the specific data points are correct."
    };
};
